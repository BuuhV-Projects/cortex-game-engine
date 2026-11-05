/**
 * O passe de sombra nativo das cascatas da CSM (SPEC-0245, SPEC-0690): desenha cada cascata em C++
 * (`drawShadowPass`) e guarda, por cascata, o que o receptor nativo lê — a textura e a `shadow.matrix` do último
 * desenho. Saiu do `CameraFollowingCSM.ts` (466 linhas) pela regra de 500 linhas (SPEC-0668).
 *
 * - **Recusa por cascata** (SPEC-0690, item 2): cada cascata tem o próprio resultado. A recusada fica desligada no
 *   receptor nativo naquele quadro (luz plena) e volta ao `three` (`autoUpdate = true`); as outras seguem.
 * - **Escalonamento** (SPEC-0675, também no caminho nativo): a cascata 0 redesenha todo quadro e a `i > 0` só quando
 *   `(quadro + i) % farCascadeInterval === 0`. No quadro em que não redesenha, o receptor usa o mapa e a matriz do
 *   último desenho — a matriz é guardada junto com o desenho, nunca recalculada.
 *
 * A ordem dentro de cada cascata não é livre:
 *
 * 1. `shadow.updateMatrices(luz)`. Com o passe do `three` desligado ninguém mais chama isso, e a matriz que AMOSTRA o
 *    mapa congela, prendendo a sombra ao mundo de um frame antigo. Falha silenciosa e visual.
 * 2. `viewProj` em `Float64Array`. A multiplicação por `model` acontece em `double` no C++; degradar aqui é o caminho
 *    conhecido para as bandas da SPEC-0234.
 * 3. o alvo vem por IDENTIDADE do objeto (`backend.get(depthTexture)`), reaquirido por frame. O rótulo
 *    `'ShadowDepthTexture'` entra só como ASSERÇÃO — identificar recurso por dimensão é o que custou dois dias no M5,
 *    e é a regra de medição 4 da SPEC-0245.
 */
import { Matrix4, VSMShadowMap, type BufferGeometry, type Camera, type Object3D, type Vector3 } from 'three';
import { debug, isDebug } from '../../core/debug.js';
import type { NativeSceneMirror } from '../../core/NativeSceneMirror.js';
import type { ShadowPassOutcome } from '../../core/sceneMirror/mirrorBridge.js';
import { shadowPassAccepted } from '../../core/sceneMirror/shadowPassOutcome.js';
import { traceSunShadowCascade, traceSunShadowDrawn, traceSunShadowHandedBack } from '../../core/perfTrace/traceCounters.js';
import { CasterGeometryRegistry } from '../../render/CasterGeometryRegistry.js';
import { ShadowAlphaClipSync } from '../../render/ShadowAlphaClipSync.js';
import type { CsmCascadeReceiver, CsmReceiverState } from '../../render/native/frame/shadowCsm.js';
import { SHADOW_DEPTH_TEXTURE_LABEL, ensureCascadeMap, type CascadeMapRenderer, type CascadeMapShadow } from './cascadeMaps.js';

/** Elementos de uma `Matrix4`. */
const ELEMENTOS_DA_MATRIZ = 16;

/**
 * "A cena não foi contada neste frame" para o gate do passe nativo: a contagem vinha de uma travessia de ~1.300 nós
 * que o E7 tirou, e o espelho acompanha a cena por `childadded`/`childremoved` (SPEC-0246, premissa 8). A recusa
 * por divergência fica do lado C++, coberta por teste.
 */
const NOS_DA_CENA_NAO_MEDIDOS = -1;

/** A cascata como o CSM a guarda em `lights[]` (uma `LwLight` com `shadow`). */
export interface CascataDoCsm {
  shadow?: CascadeMapShadow & {
    camera?: Camera & { coordinateSystem: number };
    autoUpdate: boolean;
    needsUpdate: boolean;
    map?: { depthTexture?: { name?: string } } | null;
    matrix?: { elements: ArrayLike<number> };
    bias?: number;
    normalBias?: number;
    intensity?: number;
    updateMatrices?: (luz: unknown) => void;
  };
  updateMatrixWorld?: () => void;
  target?: { updateMatrixWorld?: () => void };
}

/** O renderer (o `three`) como o passe o vê. */
export interface CsmNativeRenderer extends CascadeMapRenderer {
  backend?: { get(alvo: unknown): { buffer?: unknown; texture?: unknown } | undefined };
}

/** O que o passe precisa do quadro. */
export interface CsmNativeFrame {
  scene: Object3D;
  renderer: CsmNativeRenderer;
  mirror: NativeSceneMirror;
  /** Posição da câmera do filtro angular (SPEC-0197). */
  filterCamera: Vector3;
  minRatio: number;
  farCascadeInterval: number;
  /** Redesenha todas neste quadro (troca de câmera: as cascatas foram recalculadas). */
  redrawAll: boolean;
}

/** Recusa de uma cascata no quadro: motivo e, quando o C++ recusou, o resultado dele. */
interface Recusa {
  cascade: number;
  reason: string;
  outcome?: ShadowPassOutcome;
}

export class CsmNativePass {
  /** O que o receptor nativo lê de cada cascata (índice = cascata). */
  readonly receivers: CsmCascadeReceiver[] = [];
  /**
   * O passe nativo assumiu TODAS as cascatas no último quadro? (SPEC-0245, E7.) É o que decide se o
   * `cullShadowCasters` ainda tem para quem trabalhar: com o C++ desenhando, o `castShadow` que ele muta não é lido
   * por ninguém, porque o enumerador nativo aplica o MESMO filtro angular por conta, a partir do valor autorado.
   */
  assumed = false;
  private readonly _state: CsmReceiverState = {
    count: 0, cameraNear: 0, shadowFar: 0, fade: false, mapWidth: 1, mapHeight: 1, intensity: 1, cascades: this.receivers,
  };
  /** Quadros contados pelo escalonamento nativo. */
  private _frame = 0;
  /** Registro de geometria dos casters (SPEC-0245, E2). Preguiçoso por frame. */
  private readonly _registry = new CasterGeometryRegistry();
  /** Recorte alfa dos casters no host (SPEC-0642). */
  private readonly _alphaClip = new ShadowAlphaClipSync();
  /** `viewProj` da cascata em DOUBLE (SPEC-0245, E4): `Float64Array`, nunca `Float32Array`. */
  private readonly _viewProj64 = new Float64Array(ELEMENTOS_DA_MATRIZ);
  private readonly _viewProj = new Matrix4();
  /** Última linha do passe nativo, para não repetir o relato todo frame. */
  private _lastReport = '';
  /** Frames seguidos com alguma cascata devolvida desde o último ASSUMIU (SPEC-0289). */
  private _handedBackFrames = 0;
  private _refusal: Recusa | null = null;

  /**
   * O passe nativo não roda neste quadro (sem espelho, `?semPasseDeSombraNativo=1`, `?semPasseDeSombra=1`): o
   * receptor nativo não amostra nenhuma cascata. Com `devolver`, as que o nativo tinha assumido voltam ao `three`.
   */
  disable(cascatas: readonly CascataDoCsm[], devolver: boolean): void {
    this.assumed = false;
    this._ensureReceivers(cascatas.length);
    for (let i = 0; i < cascatas.length; i++) {
      const receiver = this.receivers[i]!;
      const shadow = cascatas[i]!.shadow;
      if (devolver && receiver.enabled && shadow) shadow.autoUpdate = true;
      receiver.enabled = false;
    }
  }

  /** Desenha as cascatas devidas neste quadro e decide, por cascata, quem é dono do mapa. */
  draw(frame: CsmNativeFrame, cascatas: readonly CascataDoCsm[]): void {
    const backend = frame.renderer.backend!;
    // E2 — registro preguiçoso: quem ainda não subiu é tentado no próximo frame. As geometrias que o streaming
    // trouxe desde o frame passado entram na fila aqui (SPEC-0289).
    this._registry.atualizar(frame.scene, backend, frame.mirror.drainNewGeometries());
    // SPEC-0642: textura + UV de quem tem `alphaTest`, antes da 1ª cascata.
    this._alphaClip.sync(frame.mirror, backend);
    this._ensureReceivers(cascatas.length);
    const vsm = frame.renderer.shadowMap?.type === VSMShadowMap;
    const intervalo = Math.max(1, Math.floor(frame.farCascadeInterval));
    const quadro = ++this._frame;
    this._refusal = null;
    let todas = true;
    let desenhadas = 0;
    let desenhados = 0;
    for (let i = 0; i < cascatas.length; i++) {
      const receiver = this.receivers[i]!;
      const cascata = cascatas[i]!;
      // Recusada no último desenho (ou nunca desenhada): tenta de novo neste quadro, sem esperar o intervalo.
      const devida = frame.redrawAll || i === 0 || !receiver.enabled || (quadro + i) % intervalo === 0;
      if (!devida) {
        // Fica com o mapa e a matriz do último desenho; o `three` não redesenha por cima.
        if (cascata.shadow) {
          cascata.shadow.autoUpdate = false;
          cascata.shadow.needsUpdate = false;
        }
        continue;
      }
      const drawn = this._drawCascade(i, cascata, frame, backend, vsm);
      if (drawn < 0) {
        todas = false;
        continue;
      }
      desenhadas++;
      desenhados += drawn;
    }
    this.assumed = todas;
    // `_refuse` preenche a recusa dentro do laço; o TS não enxerga a escrita por método.
    const recusa = this._refusal as Recusa | null;
    if (recusa) {
      const outcome = recusa.outcome;
      traceSunShadowHandedBack(recusa.reason, outcome?.counts, outcome?.offender);
    } else if (desenhadas > 0) traceSunShadowDrawn();
    this._report(todas, desenhados, cascatas.length);
  }

  /**
   * O estado que o receptor nativo lê (`ShadowBlock`, SPEC-0690).
   *
   * @param ranges - As `_cascades` do nó (frações de `shadowFar`).
   */
  receiverState(
    cascatas: readonly CascataDoCsm[],
    ranges: readonly { x: number; y: number }[],
    cameraNear: number,
    shadowFar: number,
    fade: boolean,
  ): CsmReceiverState {
    this._ensureReceivers(cascatas.length);
    const state = this._state;
    state.count = cascatas.length;
    state.cameraNear = cameraNear;
    state.shadowFar = shadowFar;
    state.fade = fade;
    const primeira = cascatas[0]?.shadow;
    if (primeira) {
      state.mapWidth = primeira.mapSize.width;
      state.mapHeight = primeira.mapSize.height;
      state.intensity = primeira.intensity ?? 1;
    }
    for (let i = 0; i < cascatas.length; i++) {
      const receiver = this.receivers[i]!;
      const shadow = cascatas[i]!.shadow;
      receiver.bias = shadow?.bias ?? 0;
      receiver.normalBias = shadow?.normalBias ?? 0;
      receiver.near = ranges[i]?.x ?? 0;
      receiver.far = ranges[i]?.y ?? 0;
    }
    return state;
  }

  /** Desenha uma cascata; devolve os casters desenhados, ou `-1` quando recusou. */
  private _drawCascade(
    i: number,
    cascata: CascataDoCsm,
    frame: CsmNativeFrame,
    backend: NonNullable<CsmNativeRenderer['backend']>,
    vsm: boolean,
  ): number {
    const shadow = cascata.shadow;
    if (!shadow) return this._refuse(i, cascata, 'sem-alvo');
    ensureCascadeMap(shadow, frame.renderer);
    shadow.updateMatrices?.(cascata);
    const shadowCamera = shadow.camera;
    const texturaDeProfundidade = shadow.map?.depthTexture;
    if (!shadowCamera || !texturaDeProfundidade) return this._refuse(i, cascata, 'sem-alvo');
    // Asserção, não identificação: o alvo já veio pelo objeto certo. Se o rótulo mudar, a premissa quebrou —
    // recusar é o lado seguro, porque desenhar na textura errada corrompe outra coisa.
    if (texturaDeProfundidade.name !== SHADOW_DEPTH_TEXTURE_LABEL) {
      return this._refuse(i, cascata, `rotulo-inesperado:${texturaDeProfundidade.name}`);
    }
    const alvo = backend.get(texturaDeProfundidade)?.texture;
    // Sem `GPUTexture` ainda (o `three` cria a dele no primeiro render; a nossa, no `initRenderTarget`).
    if (!alvo) return this._refuse(i, cascata, 'alvo-sem-gpu');

    shadowCamera.updateMatrixWorld();
    this._viewProj.multiplyMatrices(shadowCamera.projectionMatrix, shadowCamera.matrixWorldInverse);
    const elementos = this._viewProj.elements;
    for (let k = 0; k < ELEMENTOS_DA_MATRIZ; k++) this._viewProj64[k] = elementos[k]!;
    // Tempo da ponte + C++ desta cascata, para o perf-trace achar a cascata cara (SPEC-0690, item 6).
    const inicio = performance.now();
    const resultado = frame.mirror.drawShadowPass(
      shadowCamera, frame.filterCamera, frame.minRatio, this._viewProj64, alvo, NOS_DA_CENA_NAO_MEDIDOS, vsm,
    );
    const ms = performance.now() - inicio;
    if (!resultado) return this._refuse(i, cascata, 'sem-ponte', undefined, ms);
    if (!shadowPassAccepted(resultado)) return this._refuse(i, cascata, resultado.reason, resultado, ms);

    const receiver = this.receivers[i]!;
    receiver.enabled = true;
    receiver.texture = alvo;
    if (shadow.matrix) receiver.matrix.set(shadow.matrix.elements);
    // O passe do `three` só é desligado com o nativo desenhando de fato. `autoUpdate` vai na `shadow` de CADA
    // cascata, não na do sol: o CSM clona a luz, e mexer no original não chega nas cópias.
    shadow.autoUpdate = false;
    shadow.needsUpdate = false;
    traceSunShadowCascade(
      i, resultado.status ?? 'legacy', undefined, resultado.drawn, resultado.skipped ?? 0, resultado.excluded ?? 0, ms,
    );
    return resultado.drawn;
  }

  /**
   * A cascata volta ao `three` neste quadro e fica desligada no receptor nativo (ADR-0691, item 4). `ms` é o tempo
   * do `drawShadowPass`, 0 nas recusas de antes da chamada.
   */
  private _refuse(i: number, cascata: CascataDoCsm, reason: string, outcome?: ShadowPassOutcome, ms = 0): number {
    this.receivers[i]!.enabled = false;
    if (cascata.shadow) cascata.shadow.autoUpdate = true;
    if (this._refusal === null) this._refusal = { cascade: i, reason, outcome };
    // `not-ready` e `skipped` já dizem o motivo; o resto vai como `refused:<motivo>`.
    const status = outcome?.status === 'not-ready' || outcome?.status === 'skipped' ? outcome.status : 'refused';
    traceSunShadowCascade(i, status, reason, outcome?.drawn ?? 0, outcome?.skipped ?? 0, outcome?.excluded ?? 0, ms);
    return -1;
  }

  private _ensureReceivers(count: number): void {
    for (let i = this.receivers.length; i < count; i++) {
      this.receivers.push({
        enabled: false, matrix: new Float32Array(ELEMENTOS_DA_MATRIZ), texture: null, bias: 0, normalBias: 0, near: 0, far: 0,
      });
    }
  }

  /**
   * Quantos frames seguidos ficaram com o `three` antes de o nativo reassumir (SPEC-0289): é o custo real de cada
   * geometria nova do streaming. O relato só é montado com o `debug('perf')` ligado: o `desenhados` muda quase todo
   * quadro, e a linha era uma string nova por quadro no Hermes mesmo com o log desligado (SPEC-0675).
   */
  private _report(assumiu: boolean, desenhados: number, cascatas: number): void {
    const relatar = isDebug('perf');
    let devolvidos = '';
    if (!assumiu) this._handedBackFrames++;
    else if (this._handedBackFrames > 0) {
      if (relatar) devolvidos = ` apos ${this._handedBackFrames} frame(s) devolvido(s)`;
      this._handedBackFrames = 0;
    }
    if (!relatar) return;
    const linha = assumiu || this._refusal === null
      ? `ASSUMIU desenhados=${desenhados} cascatas=${cascatas}${devolvidos}`
      : `DEVOLVEU ao three cascata=${this._refusal.cascade} motivo=${this._descreverRecusa(this._refusal)}`;
    if (linha === this._lastReport) return;
    this._lastReport = linha;
    debug('perf', `[shadowPass] ${linha}`);
  }

  private _descreverRecusa(recusa: Recusa): string {
    const r = recusa.outcome;
    let motivo = recusa.reason;
    if (r?.offender) motivo += ` ${this._descreverOfensor(r.offender)}`;
    if (r?.counts) motivo += ` [${r.counts} casters=${r.totalCasters}]`;
    return motivo;
  }

  /** QUAL nó recusou e em que estado está a geometria dele (SPEC-0289). */
  private _descreverOfensor(objeto: Object3D): string {
    const malha = objeto as Object3D & { geometry?: BufferGeometry; isInstancedMesh?: boolean; type: string };
    const geometria = malha.geometry;
    const estado = geometria ? this._registry.estado(geometria) : 'sem-geometria';
    return `no=${objeto.name || '(sem nome)'} pai=${objeto.parent?.name || '-'} tipo=${malha.isInstancedMesh ? 'InstancedMesh' : malha.type} geometria=${estado}`;
  }
}
