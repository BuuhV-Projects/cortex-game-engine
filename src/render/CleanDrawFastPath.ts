/**
 * Desenho direto de render objects limpos (SPEC-0333, passo b.1 do ADR-0330).
 *
 * O `_renderObjectDirect` do `three` gasta ~55 µs por draw no Hermes, e para os
 * objetos que nada mudou quase tudo é VERIFICAÇÃO genérica (SPEC-0331):
 * `ChainMap`, chave dinâmica com hash, `equals` sobre a lista inteira de
 * uniforms, ~30 campos de pipeline, `updateNode` em todos os nós. Este módulo
 * troca essa verificação por uma ESPECIALIZADA: quando o `three` desenha um
 * render object elegível, grava um instantâneo numérico só do que os nós dele
 * leem; no quadro seguinte, se o instantâneo bate, desenha direto
 * (`updateBefore`, nós de render/quadro e grupos compartilhados, `draw`).
 * Qualquer divergência cai no caminho do `three`, que regrava.
 *
 * Elegível = sem nó animado, plano do `RenderIdRefresh` disponível, sem
 * skin/morph/batch, e todo nó de update por OBJETO é: escopo de matriz do
 * `ModelNode` (ou `modelNormalMatrix`/`modelWorldMatrixInverse`), grupo,
 * `ReferenceNode` (material, névoa, objeto) ou `TextureNode`.
 */
import { debug } from '../core/debug.js';
import { buildRenderIdPlan } from './RenderIdRefresh.js';
import { mainPassArm } from './MainPassArm.js';
import { createNativeRenderer, nativeRendererRequested } from './native/NativeRenderer.js';
import { setActiveShadowSource } from './ShadowGeometrySource.js';
import {
  DrawBatch,
  batchBackendSupported,
  drawBatchBridge,
  type BatchBackendLike,
  type BatchRoLike,
  type DrawBatchStats,
} from './DrawBatch.js';
import { applyPlan, queryFlagRequested, type NodeFrameLike, type UniformsGroupLike } from './TransformOnlyRefresh.js';
import {
  NO_VERSION,
  RenderServer,
  renderServerRequested,
  setActiveRenderServer,
  type ServerAccess,
  type ServerRendererLike,
} from './RenderServer.js';
import {
  MATRIX_ELEMENTS,
  SNAPSHOT_MIN_CAPACITY,
  SnapshotCursor,
  checkRecording,
  matrixMatch,
  restMatch,
  walkSnapshot,
  watchersFor,
  type CleanRoLike,
  type ComGravacao,
  type Gravacao,
  type NoLike,
  type ObjectLike,
  type Preparado,
} from './CleanSnapshot.js';

export * from './CleanSnapshot.js';

const QUERY_KEY = 'cleanDraw=';
/** Lote de desenhos diretos em C++ (b.2). */
const BATCH_QUERY_KEY = 'drawBatch=';
const MAIN_PASS_QUERY_KEY = 'nativeMainPass=';
/** RS1a (SPEC-0425): referências de grupo compartilhado atualizadas por render, não vigiadas por objeto. */
const SHARED_REFS_QUERY_KEY = 'sharedRefs=';
/** Chamadas de `render()` entre relatos no `debug('perf')`. */
const REPORT_RENDER_CALLS = 1200;

// ── Instalação ──────────────────────────────────────────────────────────────

/** O renderer visto por este módulo. */
export interface CleanDrawRendererLike {
  _renderObjectDirect?: (...args: unknown[]) => void;
  _nodes?: {
    updateBefore(ro: unknown): void;
    getNodeFrameForRender(ro: unknown): { renderId: number; updateNode(n: unknown): void };
    getCacheKey(scene: unknown, lightsNode: unknown): unknown;
  };
  _bindings?: { _update(group: unknown, groups: unknown): void };
  _pipelines?: { isReady(ro: unknown): boolean };
  backend?: {
    draw?: (ro: unknown, info: unknown) => void;
    updateBinding?: (binding: UniformsGroupLike) => void;
    get?: (object: unknown) => Record<string, unknown>;
    beginRender?: (...args: unknown[]) => void;
    finishRender?: (...args: unknown[]) => void;
  };
  _currentRenderContext?: unknown;
  _currentRenderBundle?: unknown;
  info?: { calls?: number };
  contextNode?: { version: number };
}

export interface CleanDrawStats {
  /** Desenhos diretos (pulou o caminho do three). */
  direct: number;
  /** Dos diretos, os que só se moveram (plano de transformação aplicado). */
  moved: number;
  /** Desenhos pelo caminho do three. */
  three: number;
  /** Render objects gravados. */
  recorded: number;
  /** Recusados na gravação (nó não conferível, tipo etc.). */
  ineligible: number;
}

export interface CleanDrawFastPath {
  readonly stats: CleanDrawStats;
  /** Estatísticas do lote em C++ (b.2), quando ligado. */
  readonly batch: DrawBatchStats | null;
  uninstall(): void;
}

/** Liga? Padrão do chamador (host); `?nativeMainPass=0` ou `?cleanDraw=0` desligam. */
export function cleanDrawRequested(fallback: boolean): boolean {
  return queryFlagRequested(MAIN_PASS_QUERY_KEY, fallback) && queryFlagRequested(QUERY_KEY, fallback);
}

/**
 * Instala no renderer JÁ inicializado. `null`, sem tocar em nada, se os
 * internos do `three` não tiverem a forma esperada.
 */
export function installCleanDrawFastPath(
  renderer: CleanDrawRendererLike,
  batchBridge = queryFlagRequested(BATCH_QUERY_KEY, true) ? drawBatchBridge() : undefined,
): CleanDrawFastPath | null {
  const nodes = renderer._nodes;
  const bindings = renderer._bindings;
  const pipelines = renderer._pipelines;
  const backend = renderer.backend;
  const original = renderer._renderObjectDirect;
  const drawOriginal = backend?.draw;
  if (
    !nodes || !bindings || !pipelines || !backend || typeof original !== 'function' || typeof drawOriginal !== 'function' ||
    typeof nodes.getCacheKey !== 'function' || typeof bindings._update !== 'function'
  ) {
    debug('perf', '[cleanDraw] internos do three ausentes: nao instalado');
    return null;
  }
  const stats: CleanDrawStats = { direct: 0, moved: 0, three: 0, recorded: 0, ineligible: 0 };
  const referenciasPorRender = queryFlagRequested(SHARED_REFS_QUERY_KEY, true);
  /**
   * Gravações por objeto, por contexto de render e por `passId`. O contexto
   * entra na chave para o passe de sombra do `three` (quando roda) não
   * disputar a vaga do passe principal a cada quadro.
   */
  const gravacoes = new WeakMap<object, Map<unknown, Map<unknown, Gravacao>>>();
  const gravacaoDe = (object: object, context: unknown, passId: unknown): Gravacao | undefined =>
    gravacoes.get(object)?.get(context)?.get(passId);
  /** Chave de ambiente memoizada por chamada de render (`info.calls`). */
  const ambiente = { scene: undefined as unknown, lights: undefined as unknown, calls: -1, key: undefined as unknown };
  const chaveDeAmbiente = (r: CleanDrawRendererLike, scene: unknown, lightsNode: unknown): unknown => {
    const calls = r.info?.calls ?? -1;
    if (ambiente.scene !== scene || ambiente.lights !== lightsNode || ambiente.calls !== calls) {
      ambiente.scene = scene;
      ambiente.lights = lightsNode;
      ambiente.calls = calls;
      ambiente.key = nodes.getCacheKey(scene, lightsNode);
    }
    return ambiente.key;
  };
  const cursor = new SnapshotCursor();
  /** Buffer de escrita da gravação, reaproveitado. */
  let escrita: Float64Array = new Float64Array(SNAPSHOT_MIN_CAPACITY);
  /**
   * Grupos compartilhados (câmera, luzes) e nós de render: uma vez por chamada
   * de `render()`, não uma por objeto — valem para todos os objetos dela.
   */
  const feitoNaChamada = new WeakMap<object, number>();
  /** `renderId` do quadro de nós desta chamada de `render()`. */
  const renderIdDaChamada = { calls: -1, renderId: 0 };
  let ultimoDesenhado: CleanRoLike | null = null;
  const relato = { calls: -1 };

  /**
   * Lote em C++ (b.2). Todo desenho do `three` passa pelo `backend.draw` abaixo,
   * e ele despacha o lote ANTES: a ordem na tela é a da RenderList.
   */
  const lote =
    batchBridge && batchBackendSupported(backend as BatchBackendLike) ? new DrawBatch(batchBridge, backend as BatchBackendLike) : null;
  if (batchBridge && !lote) debug('perf', '[drawBatch] internos do three ausentes: lote desligado');

  backend.draw = function draw(this: unknown, ro: unknown, info: unknown): void {
    lote?.flush();
    ultimoDesenhado = ro as CleanRoLike;
    drawOriginal.call(this, ro, info);
  };
  // Fim e começo de passe: nada acumulado pode sobrar para o passe seguinte.
  const beginOriginal = backend.beginRender;
  const finishOriginal = backend.finishRender;
  if (lote && beginOriginal && finishOriginal) {
    backend.beginRender = function beginRender(this: unknown, ...args: unknown[]): void {
      lote.flush();
      beginOriginal.apply(this, args);
    };
    backend.finishRender = function finishRender(this: unknown, ...args: unknown[]): void {
      lote.flush();
      finishOriginal.apply(this, args);
    };
  }

  /** O que não muda num render object: vigias e plano (ou `null` = inelegível). */
  const preparados = new WeakMap<object, Preparado | null>();
  /** Render objects descartados pelo `three` (material/geometria `dispose`). */
  const descartados = new WeakSet<object>();

  const preparar = (ro: CleanRoLike): Preparado | null => {
    let p = preparados.get(ro);
    if (p !== undefined) return p;
    const o = ro.object;
    const monitor = ro.getMonitor();
    const elegivel =
      ro.bundle === null && !monitor.hasNode && !monitor.hasAnimation && !o.isSkinnedMesh && !o.isBatchedMesh &&
      !o.morphTargetInfluences;
    const sharedRefs: NoLike[] = [];
    const vigias = elegivel ? watchersFor(ro, referenciasPorRender ? sharedRefs : undefined) : null;
    const plan = vigias ? buildRenderIdPlan(ro as never) : null;
    p = vigias && plan ? { vigias, plan, sharedRefs } : null;
    preparados.set(ro, p);
    if (p === null) {
      stats.ineligible++;
    } else {
      const aoDescartar = ro.onDispose;
      ro.onDispose = () => {
        descartados.add(ro);
        lote?.forget(ro);
        aoDescartar();
      };
    }
    return p;
  };

  const gravar = (
    r: CleanDrawRendererLike, ro: CleanRoLike, scene: unknown, lightsNode: unknown, clipping: unknown, passId: unknown,
  ): void => {
    const p = preparar(ro);
    if (p === null) return;
    cursor.begin(false, escrita);
    if (!walkSnapshot(ro, p.vigias, cursor)) return;
    escrita = cursor.buf;
    const n = cursor.i;
    const o = ro.object;
    let porContexto = gravacoes.get(o);
    if (!porContexto) {
      porContexto = new Map();
      gravacoes.set(o, porContexto);
    }
    let porPasse = porContexto.get(r._currentRenderContext);
    if (!porPasse) {
      porPasse = new Map();
      porContexto.set(r._currentRenderContext, porPasse);
    }
    let g = porPasse.get(passId);
    if (g === undefined || g.ro !== ro) {
      g = {
        ro, material: ro.material, context: r._currentRenderContext, passId, lights: lightsNode, clipping,
        envKey: undefined, contextNodeVersion: 0, vigias: p.vigias, instantaneo: new Float64Array(n), plan: p.plan,
        sharedRefs: p.sharedRefs, versaoDoMundo: NO_VERSION,
      };
      porPasse.set(passId, g);
    }
    // Regravação no lugar: objeto que se move passa por aqui todo quadro.
    g.lights = lightsNode;
    g.clipping = clipping;
    g.server = undefined;
    g.versaoDoMundo = NO_VERSION;
    // A mais recente fica no próprio objeto: o caso comum (um contexto, um
    // passe) resolve com uma leitura de campo, sem as três buscas em mapa.
    (o as ComGravacao)._cxGravacao = g;
    g.envKey = chaveDeAmbiente(r, scene, lightsNode);
    g.contextNodeVersion = r.contextNode?.version ?? 0;
    if (g.instantaneo.length !== n) g.instantaneo = new Float64Array(n);
    g.instantaneo.set(escrita.subarray(0, n));
    stats.recorded++;
    lote?.capture(ro as unknown as BatchRoLike);
  };

  const updateBinding = backend.updateBinding?.bind(backend);

  /**
   * O que vale para todos os render objects de um estado de shader numa
   * chamada de `render()`: `updateBefore`, nós de render/quadro, referências
   * compartilhadas (RS1a) e grupos compartilhados (câmera, luzes) — sem isso a
   * câmera congela (ADR-0215). Deduplicado por estado e por grupo.
   */
  const prepararChamada = (g: Gravacao, calls: number): void => {
    const ro = g.ro;
    const estado = ro.getNodeBuilderState() as object;
    if (feitoNaChamada.get(estado) !== calls) {
      feitoNaChamada.set(estado, calls);
      nodes.updateBefore(ro);
      const frame = nodes.getNodeFrameForRender(ro);
      renderIdDaChamada.calls = calls;
      renderIdDaChamada.renderId = frame.renderId;
      const renderNodes = g.plan.renderNodes;
      for (let k = 0; k < renderNodes.length; k++) frame.updateNode(renderNodes[k]);
      // Antes dos grupos compartilhados abaixo: o UBO de render sobe com o valor novo.
      const refs = g.sharedRefs;
      for (let k = 0; k < refs.length; k++) frame.updateNode(refs[k]);
    } else if (renderIdDaChamada.calls !== calls) {
      renderIdDaChamada.calls = calls;
      renderIdDaChamada.renderId = nodes.getNodeFrameForRender(ro).renderId;
    }
    const shared = g.plan.shared;
    for (let k = 0; k < shared.length; k++) {
      const grupo = shared[k] as object;
      if (feitoNaChamada.get(grupo) === calls) continue;
      feitoNaChamada.set(grupo, calls);
      bindings._update(grupo, g.plan.groups);
    }
  };

  /** Só a matriz mudou: o plano do ADR-0290 (nós de objeto + UBOs). `false` = precisa do three. */
  const aplicarMovimento = (g: Gravacao): boolean => {
    const ro = g.ro;
    const frame = nodes.getNodeFrameForRender(ro);
    if (updateBinding === undefined || ro.getMonitor().needsVelocity?.((frame as { renderer?: unknown }).renderer) === true) {
      return false;
    }
    applyPlan(frame as unknown as NodeFrameLike, g.plan.object, updateBinding);
    const m = ro.object.matrixWorld.elements;
    for (let k = 0; k < MATRIX_ELEMENTS; k++) g.instantaneo[k] = m[k]!;
    // Copiada fora da projeção: a versão adotada já não descreve esta matriz (SPEC-0682).
    g.versaoDoMundo = NO_VERSION;
    stats.moved++;
    return true;
  };

  /** O caminho do three, e a (re)gravação de quem ele desenhou. */
  const tresCaminho = (
    r: CleanDrawRendererLike, object: unknown, material: unknown, scene: unknown, camera: unknown, lightsNode: unknown,
    group: unknown, clippingContext: unknown, passId: unknown,
  ): void => {
    ultimoDesenhado = null;
    original.call(r, object, material, scene, camera, lightsNode, group, clippingContext, passId);
    stats.three++;
    const desenhado = ultimoDesenhado as CleanRoLike | null;
    if (desenhado !== null && desenhado.object === object && r._currentRenderBundle === null) {
      gravar(r, desenhado, scene, lightsNode, clippingContext, passId);
    }
  };

  renderer._renderObjectDirect = function renderObjectDirect(
    this: CleanDrawRendererLike,
    object: unknown,
    material: unknown,
    scene: unknown,
    camera: unknown,
    lightsNode: unknown,
    group: unknown,
    clippingContext: unknown,
    passId: unknown,
  ): void {
    const calls = this.info?.calls ?? 0;
    if (calls !== relato.calls) {
      relato.calls = calls;
      if (calls % REPORT_RENDER_CALLS === 0) {
        debug('perf', `[cleanDraw] diretos=${stats.direct} movidos=${stats.moved} three=${stats.three} gravados=${stats.recorded} inelegiveis=${stats.ineligible}`);
        if (lote) debug('perf', `[drawBatch] lote=${lote.stats.batched} flushes=${lote.stats.flushes} receitas=${lote.stats.recorded} fora=${lote.stats.unbatchable}`);
      }
    }
    if (mainPassArm.three) {
      // Quadro do `three` no instrumento de paridade (SPEC-0362).
      tresCaminho(this, object, material, scene, camera, lightsNode, group, clippingContext, passId);
      return;
    }
    const contexto = this._currentRenderContext;
    let g: Gravacao | undefined;
    if (this._currentRenderBundle === null) {
      g = (object as ComGravacao)._cxGravacao;
      if (g === undefined || g.context !== contexto || g.passId !== passId) g = gravacaoDe(object as object, contexto, passId);
    }
    if (
      g !== undefined && !descartados.has(g.ro) && g.material === material && g.context === this._currentRenderContext &&
      restMatch(g.ro, g.vigias, g.instantaneo) &&
      g.lights === lightsNode && g.clipping === clippingContext && g.ro.geometry === (object as ObjectLike).geometry &&
      g.contextNodeVersion === (this.contextNode?.version ?? 0) &&
      chaveDeAmbiente(this, scene, lightsNode) === g.envKey
    ) {
      const ro = g.ro;
      ro.camera = camera;
      ro.drawRange = (object as ObjectLike).geometry.drawRange;
      ro.group = group;
      // O que o refresh do three garante para o render, deduplicado por ele
      // mesmo: `updateBefore`, nós de render/quadro e grupos compartilhados
      // (câmera, luzes). Sem isso a câmera congela (ADR-0215).
      // `updateBefore` e nós de render são do SHADER: render objects com o
      // mesmo `NodeBuilderState` têm os mesmos nós, então basta o primeiro de
      // cada estado por chamada (são nós RENDER/FRAME — OBJECT é inelegível).
      prepararChamada(g, calls);
      const monitor = ro.getMonitor();
      monitor.renderId = renderIdDaChamada.renderId;
      if (!matrixMatch(ro, g.instantaneo)) {
        // Só a matriz mudou: o que o `TransformOnlyRefresh` (ADR-0290) faz
        // dentro do caminho do three — os nós de objeto e os UBOs do objeto
        // (um `writeBuffer` cada) —, sem o resto da verificação.
        if (!aplicarMovimento(g)) {
          tresCaminho(this, object, material, scene, camera, lightsNode, group, clippingContext, passId);
          return;
        }
      }
      if (pipelines.isReady(ro)) {
        if (lote === null || !lote.add(ro as unknown as BatchRoLike, this.info as never)) backend.draw!(ro, this.info);
        stats.direct++;
      }
      return;
    }
    tresCaminho(this, object, material, scene, camera, lightsNode, group, clippingContext, passId);
  };

  // RS1b (SPEC-0425): o servidor reaproveita a gravação, a conferência e o lote.
  // Ligado por padrão (decisão do usuário, 2026-10-23); este caminho só existe no host.
  let desinstalarServidor: (() => void) | null = null;
  if (lote && renderServerRequested()) {
    const acesso: ServerAccess = {
      recordingOf: (object, context) => {
        const g = (object as ComGravacao)._cxGravacao;
        return (g !== undefined && g.context === context && g.passId === null ? g : gravacaoDe(object, context, null)) as never;
      },
      disposed: (ro) => descartados.has(ro),
      check: (gs, version) => checkRecording(gs as unknown as Gravacao, version),
      prepareCall: (_r, g, calls) => prepararChamada(g as unknown as Gravacao, calls),
      envKey: (r, scene, lightsNode) => chaveDeAmbiente(r as CleanDrawRendererLike, scene, lightsNode),
      applyMoved: (_r, g) => aplicarMovimento(g as unknown as Gravacao),
      batch: lote,
    };
    const servidor = new RenderServer(acesso);
    desinstalarServidor = servidor.install(renderer as unknown as ServerRendererLike);
    setActiveRenderServer(servidor);
    // Native renderer (ADR-0465, R1.1): asked before the RS1; off by default until the R1 acceptance.
    if (nativeRendererRequested()) servidor.attachNative(createNativeRenderer(renderer, batchBridge));
  }

  debug('perf', '[cleanDraw] instalado');
  return {
    stats,
    batch: lote?.stats ?? null,
    uninstall(): void {
      desinstalarServidor?.();
      setActiveRenderServer(null);
      // O provedor do passe de sombra volta a ser só o `three` (ADR-0692).
      setActiveShadowSource(null);
      lote?.flush();
      Reflect.deleteProperty(renderer, '_renderObjectDirect');
      backend.draw = drawOriginal;
      if (beginOriginal) backend.beginRender = beginOriginal;
      if (finishOriginal) backend.finishRender = finishOriginal;
    },
  };
}
