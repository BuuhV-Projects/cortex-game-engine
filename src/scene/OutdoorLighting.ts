import {
  Vector3,
  type Camera,
  type Object3D,
  DirectionalLight,
  HemisphereLight,
  AmbientLight,
  Color,
  ACESFilmicToneMapping,
  PCFSoftShadowMap,
  VSMShadowMap,
  type ColorRepresentation,
} from 'three';
import { CSMShadowNode } from 'three/examples/jsm/csm/CSMShadowNode.js';
import { Renderer } from '../core/Renderer.js';
import { Scene } from '../core/Scene.js';
import { cullShadowCasters, DEFAULT_SHADOW_CASTER_MIN_RATIO } from './ShadowCasterCulling.js';
import { debug } from '../core/debug.js';
import { activeSceneMirror } from '../core/NativeSceneMirror.js';
import { CasterGeometryRegistry } from '../render/CasterGeometryRegistry.js';

/**
 * CSM que SEGUE a câmera que está renderizando (a do frame), não a cacheada no 1º render.
 * Sem isso, o CSM trava na primeira câmera vista (a do editor) — mexer no editor afetava a
 * sombra no play, e a sombra não acompanhava o jogador. Troca a câmera por frame +
 * recomputa as cascatas quando ela muda (editor ↔ play).
 */
/** `?semPasseDeSombra=1` — medição do M6 (SPEC-0245), temporário. */
function congelarPasseDeSombra(): boolean {
  if (typeof location === 'undefined') return false;
  return new URLSearchParams(location.search ?? '').get('semPasseDeSombra') === '1';
}


/**
 * `?contarCasters=1` — medição do M6 (SPEC-0245, passo 1), TEMPORÁRIO.
 *
 * Liga a sonda que conta os draws REAIS do passe de sombra. Sem ela, comparar
 * a enumeração nativa com o `three` seria comparar com um número lido de uma
 * spec — e a regra de medição 2 da SPEC-0245 manda validar todo contador novo
 * num caso de resposta conhecida.
 */
function contarCastersPedido(): boolean {
  if (typeof location === 'undefined') return false;
  return new URLSearchParams(location.search ?? '').get('contarCasters') === '1';
}

/**
 * `?gateSombra=1` — prepara e avalia o passe de sombra nativo (SPEC-0245,
 * E2/E3 do passo 2), sem desenhar nada ainda.
 *
 * Fica atrás de uma query, e separada de `?contarCasters=1`, por dois motivos:
 * o caminho padrão do jogo não paga nada por um trabalho que ainda é
 * preparatório, e a sonda de `renderObject` do `?contarCasters=1` custa caro
 * demais para ficar ligada junto. Sai quando o E6 decidir ligar o passe.
 */
function gateDeSombraPedido(): boolean {
  if (typeof location === 'undefined') return false;
  return new URLSearchParams(location.search ?? '').get('gateSombra') === '1';
}

/**
 * Prefixo que o `ShadowNode` escreve em `scene.name` enquanto renderiza o
 * shadow map. É o único sinal que distingue, de fora, um `renderObject` do
 * passe de sombra de um do passe principal — identificar por dimensão de
 * textura é justamente o que a regra de medição 4 proíbe.
 */
const NOME_DA_CENA_DA_SOMBRA = 'Shadow Map [';

/** Draws do passe de sombra no frame ANTERIOR, e o acumulador do atual. */
let drawsDaSombraNoFrame = 0;
let drawsDaSombraAcumulando = 0;

/** Envolve `renderObject` uma única vez; sem a query, nada é instalado. */
function instalarSondaDeDrawsDaSombra(three: object): void {
  const alvo = three as {
    renderObject?: (...args: unknown[]) => unknown;
    __cortexSondaDeSombra?: boolean;
  };
  if (typeof alvo.renderObject !== 'function' || alvo.__cortexSondaDeSombra) return;
  const original = alvo.renderObject.bind(alvo);
  alvo.renderObject = (...args: unknown[]) => {
    const cena = args[1] as { name?: string } | undefined;
    if (cena?.name?.startsWith(NOME_DA_CENA_DA_SOMBRA)) drawsDaSombraAcumulando++;
    return original(...args);
  };
  alvo.__cortexSondaDeSombra = true;
}

class CameraFollowingCSM extends CSMShadowNode {
  /**
   * Limiar do shadow caster culling (SPEC-0197). `0` desliga o filtro.
   * Público: o Inspector/cena pode mudar em runtime.
   */
  shadowCasterMinRatio = DEFAULT_SHADOW_CASTER_MIN_RATIO;

  /** Frames desde a última passada do culling. */
  private _sinceCull = SHADOW_CULL_INTERVAL;

  /** Já congelou as cascatas para medição? (SPEC-0245, temporário) */
  private _congelouParaMedicao = false;

  /** Já envolveu o `renderObject` com a sonda de draws? (SPEC-0245, temporário) */
  private _instalouSonda = false;

  /**
   * Posição da câmera na última passada do filtro angular (SPEC-0245).
   *
   * É ELA que a conferência tem de usar, não a do frame: o `castShadow` que o
   * `three` desenha agora foi decidido na última passada, até 9 frames atrás.
   * Enumerar com a câmera atual compara o C++ de hoje com o `three` de ontem e
   * produz uma divergência que é do instrumento, não do enumerador.
   */
  private readonly _cameraDoUltimoCull = new Vector3();

  /** Registro de geometria dos casters (SPEC-0245, E2). Preguiçoso por frame. */
  private readonly _registroDeCasters = new CasterGeometryRegistry();

  /**
   * Nós que a cena tinha na última contagem; `-1` = ainda não contado.
   *
   * Medido no intervalo do culling, não por frame: percorrer ~1.300 nós é
   * justamente o custo que este marco existe para eliminar. A consequência é
   * que um nó criado entre duas contagens só aparece para o gate até 10 frames
   * depois — aceitável enquanto o `three` ainda desenha a sombra, e o que o E6
   * precisa resolver antes de desligá-lo.
   */
  private _nosDaCena = -1;

  /** Última linha do gate, para não repetir o mesmo veredito todo frame. */
  private _ultimoVeredito = '';

  override updateBefore(
    frame: Parameters<CSMShadowNode['updateBefore']>[0],
  ): ReturnType<CSMShadowNode['updateBefore']> {
    // Segue SÓ a câmera de visão (perspectiva). O `frame.camera` durante o passe de
    // profundidade das cascatas é a câmera ORTOGRÁFICA da sombra — segui-la travava a
    // sombra numa direção fixa (a "cunha"). Por isso o filtro `isPerspectiveCamera`.
    // Medição do M6 (SPEC-0245) — TEMPORÁRIO. Congela o RENDER da sombra sem
    // tocar em material nem em `receiveShadow`, ao contrário de `?semSombras=1`
    // e `?semCasters=1`, que desligam a luz junto e derrubam o subsistema
    // inteiro. O delta contra o baseline é o teto do M6.
    //
    // Aplicado AQUI, e não na criação do nó: `this.lights` só é populado no
    // `_init`, que roda no primeiro `setup`. Tentar antes congelava zero
    // cascatas — e falhava em silêncio.
    if (!this._congelouParaMedicao && congelarPasseDeSombra()) {
      const cascatas = (this as unknown as { lights?: { shadow?: { autoUpdate: boolean } }[] })
        .lights;
      let congeladas = 0;
      for (const l of cascatas ?? []) {
        if (l.shadow) {
          l.shadow.autoUpdate = false;
          congeladas += 1;
        }
      }
      if (congeladas > 0) {
        this._congelouParaMedicao = true;
        debug('scene', `MEDIÇÃO: passe de sombra congelado em ${congeladas} cascatas`);
      }
    }
    const cam = (frame as unknown as { camera?: { isPerspectiveCamera?: boolean } } | null)?.camera;
    const self = this as unknown as { camera: unknown; updateFrustums: () => void };
    if (cam?.isPerspectiveCamera && cam !== self.camera) {
      self.camera = cam;
      self.updateFrustums();
    }
    // Shadow caster culling (SPEC-0197): aqui é o ÚNICO ponto que enxerga a
    // câmera do frame — vale tanto pro jogo quanto pro editor F2, que renderiza
    // com a câmera dele. Amortizado: uma passada a cada N frames.
    if (cam?.isPerspectiveCamera && contarCastersPedido()) {
      // Vira o frame da sonda: o que foi acumulado desde o último render de
      // visão são os draws de sombra de UM frame inteiro, cascatas incluídas.
      drawsDaSombraNoFrame = drawsDaSombraAcumulando;
      drawsDaSombraAcumulando = 0;
      if (!this._instalouSonda) {
        const alvo = (frame as unknown as { renderer?: object } | null)?.renderer;
        if (alvo) {
          instalarSondaDeDrawsDaSombra(alvo);
          this._instalouSonda = true;
        }
      }
    }
    if (cam?.isPerspectiveCamera) {
      this._sinceCull++;
      if (this._sinceCull >= SHADOW_CULL_INTERVAL) {
        this._sinceCull = 0;
        const scene = (frame as unknown as { scene?: Object3D } | null)?.scene;
        const camera = cam as unknown as { position: Vector3 };
        if (scene) {
          const stats = cullShadowCasters(scene, camera.position, this.shadowCasterMinRatio);
          debug('scene', `shadowCull: ${stats.culled}/${stats.evaluated} malhas fora do shadow pass`);
          this._cameraDoUltimoCull.copy(camera.position);
          // O espelho é montado UMA vez (SPEC-0234) e não cresce. Se a cena
          // ganhar nós depois disso, o `three` desenha o que o C++ não vê — e,
          // quando o passe nativo assumir, isso vira sombra faltando. Por isso
          // a contagem alimenta o gate (E3), além do diagnóstico.
          if (contarCastersPedido() || gateDeSombraPedido()) {
            let naCena = 0;
            scene.traverse(() => {
              naCena++;
            });
            this._nosDaCena = naCena;
            const espelho = activeSceneMirror();
            if (espelho?.installed && naCena !== espelho.nodeCount && contarCastersPedido()) {
              debug('perf', `[sceneMirror] cena tem ${naCena} nos, espelho tem ${espelho.nodeCount}`);
            }
          }
        }
      }
    }
    // A conferência roda TODO frame (SPEC-0245): amostra por amostra, cada
    // enumeração do C++ tem de bater com os draws que o `three` emite logo
    // depois dela. Amortizar isto esconderia a única divergência que importa.
    //
    // E roda DEPOIS do `super`: é ele que reposiciona as cascatas e recompõe a
    // ortho de cada uma. Enumerar antes usaria o frustum do frame passado e
    // divergiria em alguns objetos a cada quadro em que a câmera anda.
    const resultado = super.updateBefore(frame);
    if (cam?.isPerspectiveCamera && contarCastersPedido()) this._relatarCastersNativos();
    if (cam?.isPerspectiveCamera && gateDeSombraPedido()) this._prepararEAvaliarGate(frame);
    return resultado;
  }

  /**
   * Contagem de casters do lado C++ contra a do `three` (SPEC-0245, passo 1).
   *
   * Aqui é o único lugar que tem as DUAS coisas ao mesmo tempo: a câmera do
   * filtro angular e a ortho de cada cascata (de onde sai o frustum do passe).
   * Por enquanto só reporta — nada é desenhado em C++.
   *
   * O número que ele imprime como "three desenhou" é o do frame ANTERIOR: os
   * draws do frame atual só existem depois deste `updateBefore`. Ou seja, a
   * amostra a conferir contra esta enumeração é a da PRÓXIMA linha.
   */
  private _relatarCastersNativos(): void {
    const espelho = activeSceneMirror();
    if (!espelho?.installed) return;
    const cascatas = (
      this as unknown as {
        lights?: { shadow?: { camera?: Camera; updateMatrices?: (luz: unknown) => void } }[];
      }
    ).lights;
    if (!cascatas || cascatas.length === 0) return;

    const porCascata: number[] = [];
    let total = 0;
    for (const cascata of cascatas) {
      // O `three` só fixa a ortho da cascata DENTRO do `renderShadow`, uma
      // linha antes de desenhar. Enumerar com a matriz que está aqui no
      // `updateBefore` compara com um frustum de um frame atrás — a origem da
      // divergência de alguns objetos por quadro enquanto a câmera anda.
      cascata.shadow?.updateMatrices?.(cascata);
      const shadowCamera = cascata.shadow?.camera;
      if (!shadowCamera) continue;
      const casters = espelho.countShadowCasters(
        shadowCamera,
        this._cameraDoUltimoCull,
        this.shadowCasterMinRatio,
      );
      if (casters === undefined) return; // host sem a ponte: nada a relatar
      porCascata.push(casters);
      total += casters;
    }
    debug(
      'perf',
      `[shadowCasters] C++ enumerou ${total} em ${porCascata.length} cascata(s) ` +
        `[${porCascata.join(', ')}], three desenhou ${drawsDaSombraNoFrame}, ` +
        `minRatio=${this.shadowCasterMinRatio}`,
    );
  }

  /**
   * E2 + E3 da SPEC-0245: registra a geometria que falta e pergunta ao gate se
   * o passe nativo poderia assumir este frame. **Nada é desenhado.**
   *
   * Os dois andam juntos porque o gate depende do registro: enquanto uma
   * geometria não subiu para a GPU, ela é motivo de recusa — e é exatamente
   * isso que se quer ver no log dos primeiros frames.
   *
   * Roda DEPOIS do `super.updateBefore`, pelo mesmo motivo da conferência de
   * casters: é ele que reposiciona as cascatas e recompõe a ortho de cada uma.
   */
  private _prepararEAvaliarGate(frame: unknown): void {
    const espelho = activeSceneMirror();
    if (!espelho?.installed) return;
    const contexto = frame as {
      scene?: Object3D;
      renderer?: { backend?: { get(alvo: unknown): { buffer?: unknown } | undefined } } & {
        shadowMap?: { type?: number };
      };
    } | null;
    const cena = contexto?.scene;
    const renderer = contexto?.renderer;
    const backend = renderer?.backend;
    if (!cena || !backend) return;

    // E2 — o registro é preguiçoso: quem ainda não subiu para a GPU é tentado
    // de novo no próximo frame.
    this._registroDeCasters.atualizar(cena, backend);

    const cascatas = (
      this as unknown as {
        lights?: { shadow?: { camera?: Camera; updateMatrices?: (luz: unknown) => void } }[];
      }
    ).lights;
    if (!cascatas || cascatas.length === 0) return;

    const vsm = renderer?.shadowMap?.type === VSMShadowMap;
    // O veredito do frame é o das cascatas COMBINADAS: uma recusa em qualquer
    // uma recusa o frame inteiro, porque o `three` só pode manter o passe de
    // sombra por completo — não há como ele desenhar metade das cascatas.
    let pior: ReturnType<typeof espelho.shadowPassGate> | undefined;
    for (const cascata of cascatas) {
      cascata.shadow?.updateMatrices?.(cascata);
      const shadowCamera = cascata.shadow?.camera;
      if (!shadowCamera) continue;
      const veredito = espelho.shadowPassGate(
        shadowCamera,
        this._cameraDoUltimoCull,
        this.shadowCasterMinRatio,
        this._nosDaCena,
        vsm,
      );
      if (!veredito) return; // host sem a ponte: nada a relatar
      if (!pior || (pior.accepted && !veredito.accepted)) pior = veredito;
    }
    if (!pior) return;

    // O gate tem de ser OBSERVÁVEL: sem o motivo e a contagem no log, uma
    // recusa vira "não funciona" sem causa, e a causa só apareceria com
    // depurador. Relata quando o veredito muda, não a cada frame.
    const detalhe = Object.entries(pior.counts)
      .filter(([, n]) => n > 0)
      .map(([motivo, n]) => `${motivo}=${n}`)
      .join(' ');
    const linha =
      `${pior.accepted ? 'ACEITA' : 'RECUSA'} motivo=${pior.reason} ` +
      `objetos=${pior.offenders} casters=${pior.totalCasters} ` +
      `recusados=${pior.refusedCasters} geometrias=${this._registroDeCasters.total} ` +
      `pendentes=${this._registroDeCasters.pendentes}` +
      (detalhe ? ` [${detalhe}]` : '');
    if (linha === this._ultimoVeredito) return;
    this._ultimoVeredito = linha;
    debug('perf', `[shadowGate] ${linha}`);
  }
}

/** Frames entre passadas do shadow caster culling (SPEC-0197). */
const SHADOW_CULL_INTERVAL = 10;

/** Opções de {@link setupOutdoorLighting}. Todas opcionais — defaults "verão". */
export interface OutdoorLightingOptions {
  /** Cor do céu (topo do hemisphere). Default `0x9fd6ee`. */
  sky?: ColorRepresentation;
  /** Cor refletida do chão (base do hemisphere). Default `0xb6e2a8`. */
  ground?: ColorRepresentation;
  /** Cor do sol. Default `0xfff2cc` (luz quente). */
  sunColor?: ColorRepresentation;
  /** Intensidade do sol. Default `3.2`. */
  sunIntensity?: number;
  /** Posição/direção do sol. Default `[35, 55, 25]`. */
  sunPosition?: [number, number, number];
  /** Intensidade do hemisphere (preenchimento azul-céu). Default `0.55`. */
  hemisphereIntensity?: number;
  /** Intensidade do ambient (levanta as sombras sem matar contraste). Default `0.18`. */
  ambientIntensity?: number;
  /** Exposição do tone mapping (ACES Filmic). Default `0.95`. */
  exposure?: number;
  /** Liga shadowMap + `sun.castShadow`. Default `true`. */
  shadows?: boolean;
  /** Resolução do shadow map (lado, em px). Default `2048`. */
  shadowMapSize?: number;
  /**
   * Meia-extensão do frustum de sombra (cobre `±area` em X/Z ao redor da
   * origem). Aumente pra cenas maiores; menor = sombras mais nítidas. Default `60`.
   */
  shadowArea?: number;
  /** Bias da sombra (combate shadow acne). Default `-0.0005`. */
  shadowBias?: number;
  /** Normal bias da sombra (combate peter-panning). Default `0.05`. */
  shadowNormalBias?: number;
  /**
   * Liga **Cascaded Shadow Maps** (estilo Unity, WebGPU): cascatas de sombra que
   * SEGUEM a câmera ativa — nítidas perto, cobertura longe, no mapa inteiro. Ideal pra
   * mundo aberto (substitui o frustum único do `shadowArea`). Default `false`.
   */
  csm?: boolean;
  /** Nº de cascatas (CSM). Mais = transição mais suave, mais custo. Default `3`. */
  shadowCascades?: number;
  /** Distância máxima de sombra (CSM, m) — além disso não há sombra. Default `250`. */
  shadowDistance?: number;
  /** Margem da luz do CSM (quão atrás da câmera o sol "vê" pra projetar). Default `200`. */
  lightMargin?: number;
  /** Suaviza a transição entre cascatas do CSM (tira a "linha de corte"). Default `true`. */
  shadowFade?: boolean;
  /**
   * **Shadow caster culling por tamanho angular** (SPEC-0197, só com `csm`):
   * uma malha para de projetar sombra quando `raio / distância_da_câmera` fica
   * abaixo deste valor — a sombra dela ocuparia poucos pixels e não vale o draw
   * extra por cascata. Default `0.05` (some além de ~20× o próprio raio); `0`
   * desliga. Medido no `kart-racer`: 2807 → 1966 draws, sem diferença visível.
   */
  shadowCasterMinRatio?: number;
}

/** Luzes criadas por {@link setupOutdoorLighting} — ajuste-as em runtime. */
export interface OutdoorLighting {
  sun: DirectionalLight;
  hemisphere: HemisphereLight;
  ambient: AmbientLight;
}

/**
 * Preset de iluminação exterior "verão": configura o tone mapping cinematográfico
 * (ACES Filmic) e soft shadows (PCF) no renderer, e adiciona à cena um sol
 * direcional com sombras + um hemisphere (preenchimento céu/chão) + um ambient
 * discreto. Encapsula a configuração de shadow-camera/tone-mapping que, crua,
 * exige mexer no `WebGPURenderer` e no `DirectionalLight.shadow`.
 *
 * Retorna as luzes pra ajuste fino (ex.: desligar a sombra do sol, mudar
 * intensidade, reposicionar). Pra excluir um objeto específico do shadowMap,
 * use `setShadows(obj, { castShadow: false })`.
 *
 * @param renderer - O {@link Renderer} do jogo (tone mapping + shadowMap).
 * @param scene - A {@link Scene} onde adicionar as luzes.
 * @param options - Ver {@link OutdoorLightingOptions}.
 * @returns `{ sun, hemisphere, ambient }`.
 *
 * @example
 * const lights = setupOutdoorLighting(renderer, scene, { sky: 0x9fc6e0 })
 * lights.sun.intensity = 2.4 // ajuste em runtime
 */
export function setupOutdoorLighting(
  renderer: Renderer,
  scene: Scene,
  options: OutdoorLightingOptions = {},
): OutdoorLighting {
  const {
    sky = 0x9fd6ee,
    ground = 0xb6e2a8,
    sunColor = 0xfff2cc,
    sunIntensity = 3.2,
    sunPosition = [35, 55, 25],
    hemisphereIntensity = 0.55,
    ambientIntensity = 0.18,
    exposure = 0.95,
    shadows = true,
    shadowMapSize = 2048,
    shadowArea = 60,
    shadowBias = -0.0005,
    shadowNormalBias = 0.05,
    csm = false,
    shadowCascades = 3,
    shadowDistance = 250,
    lightMargin = 200,
    shadowFade = true,
    shadowCasterMinRatio = DEFAULT_SHADOW_CASTER_MIN_RATIO,
  } = options;

  const three = renderer.threeRenderer;
  three.toneMapping = ACESFilmicToneMapping;
  three.toneMappingExposure = exposure;
  three.shadowMap.enabled = shadows;
  three.shadowMap.type = PCFSoftShadowMap;

  const hemisphere = new HemisphereLight(new Color(sky), new Color(ground), hemisphereIntensity);
  scene.add(hemisphere);

  const ambient = new AmbientLight(0xffffff, ambientIntensity);
  scene.add(ambient);

  const sun = new DirectionalLight(new Color(sunColor), sunIntensity);
  sun.position.set(sunPosition[0], sunPosition[1], sunPosition[2]);
  if (shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.width = shadowMapSize;
    sun.shadow.mapSize.height = shadowMapSize;
    sun.shadow.bias = shadowBias;
    sun.shadow.normalBias = shadowNormalBias;
    const cam = sun.shadow.camera;
    cam.left = -shadowArea;
    cam.right = shadowArea;
    cam.top = shadowArea;
    cam.bottom = -shadowArea;
    cam.near = 1;
    // ⚠️ Com CSM, o `far` precisa cobrir `lightMargin + shadowDistance`.
    //
    // As cascatas CLONAM este `shadow` (`light.shadow.clone()` no `_init` do
    // CSMShadowNode), e a cada frame o three planta a luz de cada cascata
    // RECUADA de `lightMargin` (`_center.z = bbox.max.z + lightMargin`). Com o
    // `shadowArea * 4` do caminho sem CSM (240) e a margem padrão (200), sobravam
    // ~40u de profundidade útil: tudo mais fundo caía fora do far plane e a
    // sombra era **cortada por uma reta** no meio da cena — some um pedaço do
    // vulto, o resto fica. Era o "sombra cortando" do Mundo 3, cujos asteroides
    // têm 25u de profundidade num percurso de 170u.
    //
    // Não custa performance: far plane é volume de projeção, não passada nem
    // texel. Sem CSM, mantém o valor de sempre.
    cam.far = csm ? lightMargin + shadowDistance + shadowArea : shadowArea * 4;
    cam.updateProjectionMatrix();

    // CSM (Cascaded Shadow Maps, WebGPU): cascatas que seguem a câmera ativa — cobre o
    // mundo todo com nitidez perto. Substitui o frustum único acima (que vira fallback).
    if (csm) {
      const csmNode = new CameraFollowingCSM(sun, {
        cascades: shadowCascades,
        maxFar: shadowDistance,
        mode: 'practical',
        lightMargin,
      });
      (csmNode as unknown as { fade: boolean }).fade = shadowFade; // suaviza a emenda das cascatas
      csmNode.shadowCasterMinRatio = shadowCasterMinRatio; // SPEC-0197
      (sun.shadow as unknown as { shadowNode: unknown }).shadowNode = csmNode;

    }
  }
  scene.add(sun);

  return { sun, hemisphere, ambient };
}
