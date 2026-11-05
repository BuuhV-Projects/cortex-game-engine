/**
 * O CSM do `setupOutdoorLighting` (SPEC-0197, SPEC-0245): cascatas que seguem a câmera do quadro, o filtro de
 * casters por tamanho angular, o passe de sombra nativo e o escalonamento das cascatas distantes no caminho `three`
 * (SPEC-0675). Saiu do `OutdoorLighting.ts` (582 linhas) pela regra de 500 linhas (SPEC-0668).
 *
 * Com o renderer nativo (SPEC-0690, ADR-0691) quem dirige a CSM é o lado nativo: o `ShadowBlock` chama
 * {@link CameraFollowingCSM.updateNative} uma vez por quadro, porque o `updateBefore` só roda quando um material
 * desenhado PELO `three` usa o nó — com todos os receptores nativos, nunca. O passe das cascatas em C++ mora em
 * `csm/CsmNativePass.ts`.
 */
import { Vector3, type Object3D } from 'three';
import { CSMShadowNode } from 'three/examples/jsm/csm/CSMShadowNode.js';
import { cullShadowCasters, DEFAULT_SHADOW_CASTER_MIN_RATIO } from './ShadowCasterCulling.js';
import { debug } from '../core/debug.js';
import { activeSceneMirror } from '../core/NativeSceneMirror.js';
import { beginSection, endSection } from '../render/RenderSections.js';
import type { CsmReceiverState } from '../render/native/frame/shadowCsm.js';
import { CsmNativePass, type CascataDoCsm, type CsmNativeRenderer } from './csm/CsmNativePass.js';
import { congelarPasseDeSombra, passeDeSombraNativoDesligado } from './csm/measurementQueries.js';

/** Frames entre passadas do shadow caster culling (SPEC-0197). */
const SHADOW_CULL_INTERVAL = 10;

/** Default de {@link CameraFollowingCSM.farCascadeInterval} (SPEC-0675). */
export const DEFAULT_FAR_CASCADE_INTERVAL = 2;
/** Seção do perfil de render (SPEC-0585) com o `updateNative` inteiro: reposicionar e desenhar as cascatas. */
const SECTION_CSM_NATIVE = 'csmNative';

/** Câmera do quadro, como o CSM a lê. */
interface CameraDoQuadro {
  isPerspectiveCamera?: boolean;
  position: Vector3;
  near: number;
  far: number;
}

/** Os campos do `CSMShadowNode` (JS do three, sem tipos) que este nó usa. */
interface CsmInterno {
  camera: CameraDoQuadro | null;
  lights?: CascataDoCsm[];
  _cascades?: { x: number; y: number }[];
  maxFar: number;
  fade: boolean;
  updateFrustums(): void;
  _init(builder: { camera: unknown; renderer: unknown }): void;
}

/**
 * CSM que SEGUE a câmera que está renderizando (a do frame), não a cacheada no 1º render.
 * Sem isso, o CSM trava na primeira câmera vista (a do editor) — mexer no editor afetava a
 * sombra no play, e a sombra não acompanhava o jogador. Troca a câmera por frame +
 * recomputa as cascatas quando ela muda (editor ↔ play).
 */
export class CameraFollowingCSM extends CSMShadowNode {
  /** Marca que o `ShadowBlock` nativo procura em `sun.shadow.shadowNode` (SPEC-0690). */
  readonly isCSMShadowNode = true as const;

  /**
   * Limiar do shadow caster culling (SPEC-0197). `0` desliga o filtro.
   * Público: o Inspector/cena pode mudar em runtime.
   */
  shadowCasterMinRatio = DEFAULT_SHADOW_CASTER_MIN_RATIO;

  /**
   * CSM escalonado (SPEC-0675): sem o passe nativo (Studio/navegador), a cascata 0 redesenha todo quadro e a
   * cascata `i > 0` só quando `(quadro + i) % farCascadeInterval === 0`. `1` redesenha todas todo quadro.
   * Público: o jogo/Inspector pode mudar em runtime.
   *
   * No export, o `CsmNativePass.draw` usa o mesmo intervalo (SPEC-0690, §1).
   */
  farCascadeInterval = DEFAULT_FAR_CASCADE_INTERVAL;

  /** Quadros contados pelo escalonamento do caminho `three`. */
  private _quadroDoEscalonamento = 0;

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

  /** O passe de sombra das cascatas em C++ e o que o receptor nativo lê de cada uma (SPEC-0245, SPEC-0690). */
  private readonly _nativePass = new CsmNativePass();

  /**
   * Guarda por quadro (SPEC-0690): o `frameId` do último quadro em que a CSM foi atualizada, e por quem. O
   * `updateBefore` do `three` não refaz um quadro que o `updateNative` já fez, e o `updateNative` não refaz um que o
   * `three` já fez: nunca há dois reposicionamentos nem dois desenhos por quadro.
   */
  private _lastUpdateFrame = Number.NaN;
  private _lastUpdateByNative = false;

  override updateBefore(
    frame: Parameters<CSMShadowNode['updateBefore']>[0],
  ): ReturnType<CSMShadowNode['updateBefore']> {
    const quadro = frame as unknown as {
      frameId?: number;
      camera?: CameraDoQuadro;
      scene?: Object3D;
      renderer?: CsmNativeRenderer;
    } | null;
    const id = quadro?.frameId;
    if (id !== undefined && id === this._lastUpdateFrame && this._lastUpdateByNative) return;
    this._atualizar(quadro?.camera, quadro?.scene, quadro?.renderer);
    if (id !== undefined && quadro?.camera?.isPerspectiveCamera === true) {
      this._lastUpdateFrame = id;
      this._lastUpdateByNative = false;
    }
  }

  /**
   * A mesma atualização do {@link updateBefore} (posição das cascatas, `updateMatrices` de cada `shadow`, desenho
   * em C++), dirigida pelo renderer nativo uma vez por quadro (SPEC-0690). Sem o passe nativo neste quadro (sem
   * espelho, `?semPasseDeSombraNativo=1`, `?semPasseDeSombra=1`) só desliga as cascatas no receptor nativo e deixa o
   * quadro para o `three`, como antes.
   *
   * @param frameId - O `NodeFrame.frameId` do `three` (o mesmo que o `updateBefore` vê).
   */
  updateNative(camera: unknown, scene: unknown, renderer: unknown, frameId: number): void {
    if (frameId === this._lastUpdateFrame && !this._lastUpdateByNative) return;
    const cam = camera as CameraDoQuadro | null | undefined;
    if (cam?.isPerspectiveCamera !== true) return;
    const self = this as unknown as CsmInterno;
    if (!this._passeNativoDisponivel()) {
      this._nativePass.disable(self.lights ?? [], !congelarPasseDeSombra());
      return;
    }
    // Sem receptor do `three`, o `setup` do nó (que chama o `_init`) nunca rodou: as cascatas nascem aqui.
    if (self.camera === null) self._init({ camera: cam, renderer });
    beginSection(SECTION_CSM_NATIVE);
    try {
      this._atualizar(cam, scene as Object3D, renderer as CsmNativeRenderer);
    } finally {
      endSection(SECTION_CSM_NATIVE);
    }
    this._lastUpdateFrame = frameId;
    this._lastUpdateByNative = true;
  }

  /**
   * Descarta o nó (teardown da cena em `Scene.ts`, rebuild da iluminação): o passe nativo solta o ouvinte de troca
   * de buffer do provedor, que vive tanto quanto o NativeRenderer e prenderia a cena velha (ADR-0692).
   */
  override dispose(): void {
    this._nativePass.dispose();
    super.dispose();
  }

  /** O que o receptor nativo lê das cascatas neste quadro (`ShadowBlock`, SPEC-0690). */
  nativeReceiverState(): CsmReceiverState {
    const self = this as unknown as CsmInterno;
    const camera = self.camera;
    return this._nativePass.receiverState(
      self.lights ?? [],
      self._cascades ?? [],
      camera?.near ?? 0,
      camera ? Math.min(self.maxFar, camera.far) : 0,
      self.fade,
    );
  }

  /** O corpo comum do `updateBefore` e do `updateNative`. */
  private _atualizar(cam: CameraDoQuadro | undefined, cena: Object3D | undefined, renderer: CsmNativeRenderer | undefined): void {
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
    const self = this as unknown as CsmInterno;
    const trocouCamera = cam?.isPerspectiveCamera === true && cam !== self.camera;
    if (trocouCamera) {
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
      if (this._nativePass.assumed) {
        // O filtro angular passa a ser reaplicado em C++, com a câmera DESTE
        // frame. Sem estado entre frames, não há o que amortizar: o contador
        // fica armado para que a volta ao `three` role o culling no MESMO
        // frame da recusa, e não até 10 frames depois com `castShadow` velho.
        this._cameraDoFiltroAngular.copy(cam.position);
        this._sinceCull = SHADOW_CULL_INTERVAL;
      } else if (++this._sinceCull >= SHADOW_CULL_INTERVAL) {
        this._sinceCull = 0;
        if (cena) {
          const stats = cullShadowCasters(cena, cam.position, this.shadowCasterMinRatio);
          debug('scene', `shadowCull: ${stats.culled}/${stats.evaluated} malhas fora do shadow pass`);
          this._cameraDoFiltroAngular.copy(cam.position);
        }
      }
    }
    // O passe nativo roda DEPOIS do `super`: é ele que reposiciona as cascatas
    // e recompõe a ortho de cada uma. Desenhar antes usaria o frustum do frame
    // passado e a sombra divergiria a cada quadro em que a câmera anda.
    super.updateBefore(undefined as never);
    this._atualizarMatrizDasCascatas();
    if (cam?.isPerspectiveCamera) {
      this._desenharPasseDeSombraNativo(cena, renderer, trocouCamera);
      this._escalonarCascatas(trocouCamera);
    }
  }

  /**
   * O `super.updateBefore` MOVE a luz e o alvo de cada cascata no meio do render, e o `shadow.updateMatrices` de cada
   * cascata lê o `matrixWorld` deles. Com a travessia única por render (SPEC-0680) ninguém mais repropaga a pose
   * nova antes da cascata: atualiza aqui (2 nós por cascata, sem filhos). Com o espelho, a matriz é do host.
   */
  private _atualizarMatrizDasCascatas(): void {
    if (activeSceneMirror()?.installed) return;
    for (const cascata of (this as unknown as { lights?: CascataDoCsm[] }).lights ?? []) {
      cascata.updateMatrixWorld?.();
      cascata.target?.updateMatrixWorld?.();
    }
  }

  /**
   * CSM escalonado (SPEC-0675): só onde o `three` é o único que desenha as cascatas (sem espelho nativo instalado).
   * Com o espelho, o passe nativo é dono do `autoUpdate` e escalona ele mesmo (`CsmNativePass`, SPEC-0690). A cascata
   * que pula o quadro fica com o mapa e a matriz do MESMO quadro anterior (o `three` só recalcula `shadow.matrix` no
   * `updateShadow`).
   *
   * @param todas - Redesenha todas neste quadro (troca de câmera: as cascatas foram recalculadas).
   */
  private _escalonarCascatas(todas: boolean): void {
    if (this._congelouParaMedicao || congelarPasseDeSombra() || activeSceneMirror()?.installed) return;
    const cascatas = (this as unknown as { lights?: CascataDoCsm[] }).lights;
    if (!cascatas) return;
    const intervalo = Math.max(1, Math.floor(this.farCascadeInterval));
    // No 1º quadro nenhuma cascata tem mapa ainda: pular uma faria amostrar a textura zerada (faixa toda em sombra).
    const primeiro = this._quadroDoEscalonamento === 0;
    const quadro = ++this._quadroDoEscalonamento;
    for (let i = 0; i < cascatas.length; i++) {
      const sombra = cascatas[i]!.shadow;
      if (sombra) sombra.autoUpdate = todas || primeiro || i === 0 || (quadro + i) % intervalo === 0;
    }
  }

  /** O passe nativo pode rodar neste quadro? (Não no Studio/browser, nem com as queries de medição.) */
  private _passeNativoDisponivel(): boolean {
    // `?semPasseDeSombra=1` congela TODO o passe: desligar só o do `three`
    // deixaria o nativo desenhando e mediria outra coisa que não o teto.
    if (passeDeSombraNativoDesligado() || congelarPasseDeSombra()) return false;
    return activeSceneMirror()?.installed === true;
  }

  /**
   * Desenha o passe de sombra em C++ e, por cascata que ele assume, **desliga o passe do `three`** (SPEC-0245,
   * E4/E5/E6; SPEC-0690). É o caminho PADRÃO no host que oferece a ponte. Sai cedo, sem custo, no Studio e no
   * browser (não há espelho instalado) e quando `?semPasseDeSombraNativo=1` ou `?semPasseDeSombra=1` pedem o
   * contrário. Roda DEPOIS do `super.updateBefore`, que é quem reposiciona as cascatas — enumerar ou desenhar antes
   * usaria a ortho do frame passado.
   */
  private _desenharPasseDeSombraNativo(
    cena: Object3D | undefined,
    renderer: CsmNativeRenderer | undefined,
    redesenharTodas: boolean,
  ): void {
    const cascatas = (this as unknown as { lights?: CascataDoCsm[] }).lights ?? [];
    const espelho = activeSceneMirror();
    if (!this._passeNativoDisponivel() || !espelho || !cena || !renderer?.backend || cascatas.length === 0) {
      this._nativePass.disable(cascatas, !congelarPasseDeSombra());
      return;
    }
    this._nativePass.draw(
      {
        scene: cena,
        renderer,
        mirror: espelho,
        filterCamera: this._cameraDoFiltroAngular,
        minRatio: this.shadowCasterMinRatio,
        farCascadeInterval: this.farCascadeInterval,
        redrawAll: redesenharTodas,
      },
      cascatas,
    );
  }
}
