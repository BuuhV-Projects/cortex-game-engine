import {
  Matrix4,
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
/**
 * `?semPasseDeSombra=1` — FERRAMENTA DE MEDIÇÃO, permanente (SPEC-0245).
 *
 * Congela o passe de sombra INTEIRO: as cascatas do `three` param de desenhar
 * (`autoUpdate = false`) e o passe nativo não assume o lugar delas. O delta
 * contra o baseline é o **teto** do que o marco pode ganhar — foi assim que o
 * teto real de 3,65 ms foi medido, e é assim que ele se remede depois de
 * qualquer mudança no passe.
 *
 * Fica, ao contrário dos interruptores de investigação do M6, porque é a única
 * forma de responder "quanto ainda há para ganhar aqui" sem recompilar nada.
 * E congela sem tocar em `receiveShadow`, em `shadowMap.enabled` ou nos
 * materiais — desligar a luz junto derruba o subsistema e mede outra coisa.
 */
function congelarPasseDeSombra(): boolean {
  if (typeof location === 'undefined') return false;
  return new URLSearchParams(location.search ?? '').get('semPasseDeSombra') === '1';
}

/**
 * `?semPasseDeSombraNativo=1` — devolve o passe de sombra ao `three`.
 *
 * O passe nativo é o **padrão** no host que o oferece (SPEC-0245, decisão do
 * dono do projeto): é ele que entrega os 2,85 ms do marco, e deixá-lo atrás de
 * uma query faria produção pagar o custo do `three` para sempre.
 *
 * Esta query é o caminho de volta, e existe por dois motivos: é a **linha de
 * base** de qualquer remedição do ganho, e é a válvula de escape se o caminho
 * nativo se mostrar errado numa cena que não foi medida. Desligar aqui não
 * perde sombra nenhuma — quem desenha volta a ser o `three`.
 */
function passeDeSombraNativoDesligado(): boolean {
  if (typeof location === 'undefined') return false;
  return new URLSearchParams(location.search ?? '').get('semPasseDeSombraNativo') === '1';
}

/**
 * Rótulo que o `three` dá à textura de profundidade do shadow map
 * (`ShadowNode.setupRenderTarget`). Usado só como ASSERÇÃO: o alvo é obtido
 * por identidade do objeto, nunca por rótulo e nunca por dimensão.
 */
const ROTULO_DA_TEXTURA_DE_SOMBRA = 'ShadowDepthTexture';

/** Elementos de uma `Matrix4`. */
const ELEMENTOS_DA_MATRIZ = 16;

/**
 * "A cena não foi contada neste frame" para o gate do passe nativo.
 *
 * O gate sabe recusar por divergência entre a cena e o espelho, e esse número
 * era a contagem que alimentava a comparação. Ela vinha de uma travessia de
 * ~1.300 nós a cada 10 frames — o mesmo custo que o E7 acabou de tirar — e
 * deixou de ser necessária quando o espelho passou a acompanhar a cena por
 * `childadded`/`childremoved`, no frame em que a mutação acontece (E6). Quem
 * garante que essa premissa continua valendo é o contrato executável da
 * SPEC-0246 (premissa 8), não mais uma contagem em runtime.
 *
 * A recusa por divergência **fica** do lado C++: custa uma comparação, está
 * coberta por teste, e é a rede se alguém voltar a medir a cena por aqui.
 */
const NOS_DA_CENA_NAO_MEDIDOS = -1;

/** A cascata como o CSM a guarda em `lights[]` (uma `LwLight` com `shadow`). */
interface CascataDoCsm {
  shadow?: {
    camera?: Camera;
    autoUpdate: boolean;
    needsUpdate: boolean;
    map?: { depthTexture?: { name?: string } };
    updateMatrices?: (luz: unknown) => void;
  };
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

  /**
   * Posição da câmera usada pelo filtro angular (SPEC-0197/0245).
   *
   * Dois regimes, e a diferença importa. Com o `three` desenhando a sombra, é
   * a posição da ÚLTIMA passada do `cullShadowCasters` — o `castShadow` que o
   * `three` desenha agora foi decidido lá, até 9 frames atrás, e enumerar com
   * a câmera do frame compararia o C++ de hoje com o `three` de ontem. Com o
   * passe nativo desenhando, o `cullShadowCasters` não roda (E7) e ninguém
   * mais guarda estado entre frames: a posição passa a ser a do FRAME, que é
   * a resposta certa e ainda dá um filtro que reage sem os 10 frames de
   * atraso.
   */
  private readonly _cameraDoFiltroAngular = new Vector3();

  /** Registro de geometria dos casters (SPEC-0245, E2). Preguiçoso por frame. */
  private readonly _registroDeCasters = new CasterGeometryRegistry();

  /**
   * O passe nativo assumiu o último frame? (SPEC-0245, E7.)
   *
   * É o que decide se o `cullShadowCasters` ainda tem para quem trabalhar:
   * com o C++ desenhando, o `castShadow` que ele muta não é lido por ninguém,
   * porque o enumerador nativo aplica o MESMO filtro angular por conta, a
   * partir do valor autorado.
   */
  private _nativoAssumiu = false;

  /** Última linha do passe nativo, para não repetir o relato todo frame. */
  private _ultimoRelatoDoPasse = '';

  /**
   * `viewProj` da cascata em DOUBLE (SPEC-0245, E4).
   *
   * `Float64Array` e não `Float32Array`: a multiplicação por `model` acontece
   * em `double` do lado do C++, e converter aqui jogaria fora a precisão que
   * separa a sombra correta das bandas da SPEC-0234.
   */
  private readonly _viewProj64 = new Float64Array(ELEMENTOS_DA_MATRIZ);
  private readonly _viewProjDaCascata = new Matrix4();

  override updateBefore(
    frame: Parameters<CSMShadowNode['updateBefore']>[0],
  ): ReturnType<CSMShadowNode['updateBefore']> {
    // Segue SÓ a câmera de visão (perspectiva). O `frame.camera` durante o passe de
    // profundidade das cascatas é a câmera ORTOGRÁFICA da sombra — segui-la travava a
    // sombra numa direção fixa (a "cunha"). Por isso o filtro `isPerspectiveCamera`.
    // `?semPasseDeSombra=1` — congela o RENDER da sombra sem tocar em material
    // nem em `receiveShadow`. O delta contra o baseline é o TETO do M6, e é
    // com ele que se remede quanto ainda há para ganhar aqui.
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
        debug('scene', `?semPasseDeSombra: ${congeladas} cascatas congeladas`);
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
    //
    // E7 (SPEC-0245): com o passe nativo desenhando, esta travessia é trabalho
    // ÓRFÃO. Ela percorre ~1.300 nós para mutar um `castShadow` que ninguém
    // mais lê — o enumerador em C++ aplica o mesmo filtro angular por conta, a
    // partir do valor AUTORADO, e não do que esta passada deixou no objeto.
    // Ela continua indispensável quando o nativo NÃO assume: gate que recusa,
    // host sem a ponte, Studio e browser.
    if (cam?.isPerspectiveCamera) {
      const camera = cam as unknown as { position: Vector3 };
      if (this._nativoAssumiu) {
        // O filtro angular passa a ser reaplicado em C++, com a câmera DESTE
        // frame. Sem estado entre frames, não há o que amortizar: o contador
        // fica armado para que a volta ao `three` role o culling no MESMO
        // frame da recusa, e não até 10 frames depois com `castShadow` velho.
        this._cameraDoFiltroAngular.copy(camera.position);
        this._sinceCull = SHADOW_CULL_INTERVAL;
      } else if (++this._sinceCull >= SHADOW_CULL_INTERVAL) {
        this._sinceCull = 0;
        const scene = (frame as unknown as { scene?: Object3D } | null)?.scene;
        if (scene) {
          const stats = cullShadowCasters(scene, camera.position, this.shadowCasterMinRatio);
          debug('scene', `shadowCull: ${stats.culled}/${stats.evaluated} malhas fora do shadow pass`);
          this._cameraDoFiltroAngular.copy(camera.position);
        }
      }
    }
    // O passe nativo roda DEPOIS do `super`: é ele que reposiciona as cascatas
    // e recompõe a ortho de cada uma. Desenhar antes usaria o frustum do frame
    // passado e a sombra divergiria a cada quadro em que a câmera anda.
    const resultado = super.updateBefore(frame);
    if (cam?.isPerspectiveCamera) this._desenharPasseDeSombraNativo(frame);
    return resultado;
  }

  /**
   * Prepara o frame, desenha o passe de sombra em C++ e, quando ele assume,
   * **desliga o passe do `three`** (SPEC-0245, E4/E5/E6).
   *
   * É o caminho PADRÃO no host que oferece a ponte. Sai cedo, sem custo, no
   * Studio e no browser (não há espelho instalado) e quando
   * `?semPasseDeSombraNativo=1` ou `?semPasseDeSombra=1` pedem o contrário.
   *
   * Roda DEPOIS do `super.updateBefore`, que é quem reposiciona as cascatas —
   * enumerar ou desenhar antes usaria a ortho do frame passado.
   *
   * A ordem interna não é livre:
   *
   * 1. `shadow.updateMatrices(luz)` por cascata. Com o passe do `three`
   *    desligado ninguém mais chama isso, e o uniforme `lightShadowMatrix` —
   *    o que AMOSTRA o mapa — congela, prendendo a sombra ao mundo de um frame
   *    antigo. Falha silenciosa e visual.
   * 2. `viewProj` em `Float64Array`. A multiplicação por `model` acontece em
   *    `double` no C++; degradar aqui é o caminho conhecido para as bandas da
   *    SPEC-0234.
   * 3. o alvo vem por IDENTIDADE do objeto (`backend.get(depthTexture)`),
   *    reaquirido por frame. O rótulo `'ShadowDepthTexture'` entra só como
   *    ASSERÇÃO — identificar recurso por dimensão é o que custou dois dias no
   *    M5, e é a regra de medição 4 da spec.
   */
  private _desenharPasseDeSombraNativo(frame: unknown): void {
    // `?semPasseDeSombra=1` congela TODO o passe: desligar só o do `three`
    // deixaria o nativo desenhando e mediria outra coisa que não o teto.
    if (passeDeSombraNativoDesligado() || congelarPasseDeSombra()) {
      this._nativoAssumiu = false;
      return;
    }
    const espelho = activeSceneMirror();
    if (!espelho?.installed) {
      this._nativoAssumiu = false;
      return;
    }
    const contexto = frame as {
      scene?: Object3D;
      renderer?: {
        backend?: { get(alvo: unknown): { buffer?: unknown; texture?: unknown } | undefined };
        shadowMap?: { type?: number };
      };
    } | null;
    const cena = contexto?.scene;
    const renderer = contexto?.renderer;
    const backend = renderer?.backend;
    if (!cena || !backend) {
      this._nativoAssumiu = false;
      return;
    }

    // E2 — registro preguiçoso: quem ainda não subiu é tentado no próximo frame.
    this._registroDeCasters.atualizar(cena, backend);

    const cascatas = (this as unknown as { lights?: CascataDoCsm[] }).lights;
    if (!cascatas || cascatas.length === 0) {
      this._nativoAssumiu = false;
      return;
    }

    const vsm = renderer?.shadowMap?.type === VSMShadowMap;
    let assumiu = true;
    let desenhados = 0;
    let motivo = 'aceito';

    for (const cascata of cascatas) {
      cascata.shadow?.updateMatrices?.(cascata);
      const shadowCamera = cascata.shadow?.camera;
      const texturaDeProfundidade = cascata.shadow?.map?.depthTexture;
      if (!shadowCamera || !texturaDeProfundidade) {
        assumiu = false;
        motivo = 'sem-alvo';
        break;
      }
      // Asserção, não identificação: o alvo já veio pelo objeto certo. Se o
      // rótulo mudar, é sinal de que a premissa quebrou — recusar é o lado
      // seguro, porque desenhar na textura errada corrompe outra coisa.
      if (texturaDeProfundidade.name !== ROTULO_DA_TEXTURA_DE_SOMBRA) {
        assumiu = false;
        motivo = `rotulo-inesperado:${texturaDeProfundidade.name}`;
        break;
      }
      const alvo = backend.get(texturaDeProfundidade)?.texture;
      if (!alvo) {
        // O `three` ainda não criou o `GPUTexture` — ele nasce no primeiro
        // render para o shadow map. Recusar aqui é o que deixa o `three`
        // desenhar o primeiro frame e criar a textura que este passe usa.
        assumiu = false;
        motivo = 'alvo-sem-gpu';
        break;
      }

      shadowCamera.updateMatrixWorld();
      this._viewProjDaCascata.multiplyMatrices(
        shadowCamera.projectionMatrix,
        shadowCamera.matrixWorldInverse,
      );
      const elementos = this._viewProjDaCascata.elements;
      for (let i = 0; i < ELEMENTOS_DA_MATRIZ; i++) this._viewProj64[i] = elementos[i]!;

      const resultado = espelho.drawShadowPass(
        shadowCamera,
        this._cameraDoFiltroAngular,
        this.shadowCasterMinRatio,
        this._viewProj64,
        alvo,
        NOS_DA_CENA_NAO_MEDIDOS,
        vsm,
      );
      if (!resultado || resultado.refused || resultado.drawn === 0) {
        assumiu = false;
        motivo = resultado ? resultado.reason : 'sem-ponte';
        break;
      }
      desenhados += resultado.drawn;
    }

    // E7 — quem decide se o `cullShadowCasters` ainda tem trabalho.
    this._nativoAssumiu = assumiu;

    // O passe do `three` só é desligado com o nativo desenhando
    // de fato, e volta a ligar no frame em que o nativo recusa. `autoUpdate`
    // vai na `shadow` de CADA cascata, não na do sol: o CSM clona a luz, e
    // mexer no original não chega nas cópias.
    for (const cascata of cascatas) {
      if (!cascata.shadow) continue;
      cascata.shadow.autoUpdate = !assumiu;
      if (assumiu) cascata.shadow.needsUpdate = false;
    }

    const linha = assumiu
      ? `ASSUMIU desenhados=${desenhados} cascatas=${cascatas.length}`
      : `DEVOLVEU ao three motivo=${motivo}`;
    if (linha === this._ultimoRelatoDoPasse) return;
    this._ultimoRelatoDoPasse = linha;
    debug('perf', `[shadowPass] ${linha}`);
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
