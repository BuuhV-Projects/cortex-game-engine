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
import { modelNormalMatrix, modelWorldMatrixInverse } from 'three/tsl';
import { debug } from '../core/debug.js';
import { buildRenderIdPlan } from './RenderIdRefresh.js';
import { queryFlagRequested } from './TransformOnlyRefresh.js';

const QUERY_KEY = 'cleanDraw=';
const MAIN_PASS_QUERY_KEY = 'nativeMainPass=';
const UPDATE_OBJECT = 'object';
/** Chamadas de `render()` entre relatos no `debug('perf')`. */
const REPORT_RENDER_CALLS = 1200;
const MATRIX_ELEMENTS = 16;
/** Marca de "ausente" no instantâneo (nenhum valor real é este). */
const AUSENTE = -1.2345678e300;
/** Escopos do `ModelNode` que dependem só da matriz de mundo. */
const ESCOPOS_DA_MATRIZ = new Set(['worldMatrix', 'position', 'scale', 'direction', 'radius']);

/**
 * Campos de material que o `needsRenderUpdate` do backend WebGPU compara para
 * decidir o pipeline, mais `version` (o `needsUpdate`), `visible`, `alphaTest`
 * e `wireframe` (topologia).
 */
export const PIPELINE_FIELDS = [
  'version', 'visible', 'transparent', 'blending', 'premultipliedAlpha', 'blendSrc', 'blendDst',
  'blendEquation', 'blendSrcAlpha', 'blendDstAlpha', 'blendEquationAlpha', 'colorWrite', 'depthWrite',
  'depthTest', 'depthFunc', 'stencilWrite', 'stencilFunc', 'stencilFail', 'stencilZFail', 'stencilZPass',
  'stencilFuncMask', 'stencilWriteMask', 'stencilRef', 'side', 'alphaToCoverage', 'alphaTest', 'wireframe',
] as const;

// ── Instantâneo numérico ─────────────────────────────────────────────────────

type Valor = unknown;

/**
 * Acrescenta um valor ao instantâneo. `false` = tipo que não se sabe conferir
 * (o render object não é gravado — recusa, nunca aproximação).
 */
export function pushValue(out: number[], v: Valor): boolean {
  if (v === null || v === undefined) {
    out.push(AUSENTE);
    return true;
  }
  if (typeof v === 'number') {
    out.push(v);
    return true;
  }
  if (typeof v === 'boolean') {
    out.push(v ? 1 : 0);
    return true;
  }
  if (typeof v !== 'object') return false;
  const o = v as Record<string, unknown> & {
    isTexture?: boolean; isColor?: boolean; isVector2?: boolean; isVector3?: boolean; isVector4?: boolean;
    isMatrix3?: boolean; isMatrix4?: boolean; elements?: ArrayLike<number>;
  };
  if (o.isTexture) {
    const t = o as unknown as {
      id: number; version: number; rotation: number; matrixAutoUpdate: boolean;
      offset: { x: number; y: number }; repeat: { x: number; y: number }; center: { x: number; y: number };
    };
    out.push(t.id, t.version, t.offset.x, t.offset.y, t.repeat.x, t.repeat.y, t.rotation, t.center.x, t.center.y, t.matrixAutoUpdate ? 1 : 0);
    return true;
  }
  if (o.isColor) {
    out.push(o['r'] as number, o['g'] as number, o['b'] as number);
    return true;
  }
  if (o.isVector2) {
    out.push(o['x'] as number, o['y'] as number);
    return true;
  }
  if (o.isVector3) {
    out.push(o['x'] as number, o['y'] as number, o['z'] as number);
    return true;
  }
  if (o.isVector4) {
    out.push(o['x'] as number, o['y'] as number, o['z'] as number, o['w'] as number);
    return true;
  }
  if ((o.isMatrix3 || o.isMatrix4) && o.elements) {
    for (let i = 0; i < o.elements.length; i++) out.push(o.elements[i]!);
    return true;
  }
  return false;
}

// ── Formas mínimas dos internos do three 0.184 ──────────────────────────────

interface NoLike {
  type?: string;
  scope?: string;
  properties?: string[];
  object?: unknown;
  material?: unknown;
  isMaterialReferenceNode?: boolean;
  isTextureNode?: boolean;
  node?: unknown;
  value?: unknown;
  getUpdateType(): string;
  getUpdateBeforeType?(): string;
  getUpdateAfterType?(): string;
}

interface GeometryLike {
  id: number;
  attributes: Record<string, { id: number; version: number }>;
  index: { id: number; version: number } | null;
  drawRange: { start: number; count: number };
}

interface ObjectLike {
  matrixWorld: { elements: ArrayLike<number> };
  geometry: GeometryLike;
  receiveShadow: boolean;
  isSkinnedMesh?: boolean;
  isBatchedMesh?: boolean;
  isInstancedMesh?: boolean;
  morphTargetInfluences?: unknown;
  count?: number;
  instanceMatrix?: { version: number };
  instanceColor?: { version: number } | null;
}

export interface CleanRoLike {
  object: ObjectLike;
  material: Record<string, unknown>;
  geometry: GeometryLike;
  camera: unknown;
  drawRange: unknown;
  group: unknown;
  bundle: unknown;
  onDispose: () => void;
  getMonitor(): { hasNode: boolean; hasAnimation: boolean; renderId: number };
  getNodeBuilderState(): { updateNodes: NoLike[]; updateBeforeNodes: NoLike[]; updateAfterNodes: NoLike[] };
  getBindings(): unknown[];
}

/** Onde um valor vigiado mora, resolvido por render object na gravação. */
interface Vigia {
  holder: unknown;
  properties: string[];
}

/** O que se grava de um render object. */
interface Gravacao {
  ro: CleanRoLike;
  material: unknown;
  context: unknown;
  lights: unknown;
  clipping: unknown;
  envKey: unknown;
  contextNodeVersion: number;
  vigias: Vigia[];
  instantaneo: Float64Array;
  plan: NonNullable<ReturnType<typeof buildRenderIdPlan>>;
}

/**
 * Os vigias de um render object, ou `null` se algum nó de objeto não é
 * conferível. Exportada para os testes.
 */
export function watchersFor(ro: CleanRoLike): Vigia[] | null {
  const estado = ro.getNodeBuilderState();
  for (const n of estado.updateBeforeNodes) if (n.getUpdateBeforeType?.() === UPDATE_OBJECT) return null;
  for (const n of estado.updateAfterNodes) if (n.getUpdateAfterType?.() === UPDATE_OBJECT) return null;
  const vigias: Vigia[] = [];
  const saidasDeReferencia = new Set<unknown>();
  const texturas: NoLike[] = [];
  for (const n of estado.updateNodes) {
    if (n.getUpdateType() !== UPDATE_OBJECT) continue;
    if (n === (modelNormalMatrix as unknown) || n === (modelWorldMatrixInverse as unknown)) continue;
    if (n.type === 'ModelNode' && ESCOPOS_DA_MATRIZ.has(n.scope ?? '')) continue;
    if (n.type === 'UniformGroupNode') continue;
    if (Array.isArray(n.properties)) {
      // `ReferenceNode`: material (o do render object, ou um fixo), um objeto
      // fixo (névoa) ou o próprio objeto desenhado.
      const holder = n.isMaterialReferenceNode
        ? (n.material ?? ro.material)
        : (n.object ?? ro.object);
      vigias.push({ holder, properties: n.properties });
      if (n.node) saidasDeReferencia.add(n.node);
      continue;
    }
    if (n.isTextureNode || n.type === 'TextureNode') {
      texturas.push(n);
      continue;
    }
    return null;
  }
  // `TextureNode` que é a saída de uma referência já é vigiado por ela (o
  // valor dele é sobrescrito a cada update). Os outros têm textura fixa.
  for (const t of texturas) {
    if (!saidasDeReferencia.has(t)) vigias.push({ holder: t, properties: ['value'] });
  }
  return vigias;
}

/**
 * Instantâneo de tudo que o desenho direto precisa conferir. `null` = algo
 * não conferível.
 */
export function snapshot(ro: CleanRoLike, vigias: Vigia[], out: number[]): boolean {
  out.length = 0;
  const o = ro.object;
  const m = o.matrixWorld.elements;
  for (let i = 0; i < MATRIX_ELEMENTS; i++) out.push(m[i]!);
  out.push(o.receiveShadow ? 1 : 0);
  if (o.isInstancedMesh) {
    out.push(o.count ?? 0, o.instanceMatrix?.version ?? AUSENTE, o.instanceColor?.version ?? AUSENTE);
  }
  const g = o.geometry;
  out.push(g.id, g.drawRange.start, g.drawRange.count, g.index ? g.index.id : AUSENTE, g.index ? g.index.version : AUSENTE);
  for (const nome in g.attributes) {
    const a = g.attributes[nome]!;
    out.push(a.id, a.version);
  }
  const mat = ro.material;
  for (const campo of PIPELINE_FIELDS) if (!pushValue(out, mat[campo])) return false;
  for (const v of vigias) {
    let valor: unknown = v.holder;
    for (const p of v.properties) valor = valor === null || valor === undefined ? undefined : (valor as Record<string, unknown>)[p];
    if (!pushValue(out, valor)) return false;
  }
  return true;
}

/** A matriz de mundo é o começo do instantâneo: conferida antes do resto. */
function matrizIgual(instantaneo: Float64Array, m: ArrayLike<number>): boolean {
  for (let i = 0; i < MATRIX_ELEMENTS; i++) if (instantaneo[i] !== m[i]) return false;
  return true;
}

function iguais(a: Float64Array, b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

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
  backend?: { draw?: (ro: unknown, info: unknown) => void };
  _currentRenderContext?: unknown;
  _currentRenderBundle?: unknown;
  info?: { calls?: number };
  contextNode?: { version: number };
}

export interface CleanDrawStats {
  /** Desenhos diretos (pulou o caminho do three). */
  direct: number;
  /** Desenhos pelo caminho do three. */
  three: number;
  /** Render objects gravados. */
  recorded: number;
  /** Recusados na gravação (nó não conferível, tipo etc.). */
  ineligible: number;
}

export interface CleanDrawFastPath {
  readonly stats: CleanDrawStats;
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
export function installCleanDrawFastPath(renderer: CleanDrawRendererLike): CleanDrawFastPath | null {
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
  const stats: CleanDrawStats = { direct: 0, three: 0, recorded: 0, ineligible: 0 };
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
  const scratch: number[] = [];
  let ultimoDesenhado: CleanRoLike | null = null;
  const relato = { calls: -1 };

  backend.draw = function draw(this: unknown, ro: unknown, info: unknown): void {
    ultimoDesenhado = ro as CleanRoLike;
    drawOriginal.call(this, ro, info);
  };

  /** O que não muda num render object: vigias e plano (ou `null` = inelegível). */
  const preparados = new WeakMap<object, { vigias: Vigia[]; plan: Gravacao['plan'] } | null>();
  /** Render objects descartados pelo `three` (material/geometria `dispose`). */
  const descartados = new WeakSet<object>();

  const preparar = (ro: CleanRoLike): { vigias: Vigia[]; plan: Gravacao['plan'] } | null => {
    let p = preparados.get(ro);
    if (p !== undefined) return p;
    const o = ro.object;
    const monitor = ro.getMonitor();
    const elegivel =
      ro.bundle === null && !monitor.hasNode && !monitor.hasAnimation && !o.isSkinnedMesh && !o.isBatchedMesh &&
      !o.morphTargetInfluences;
    const vigias = elegivel ? watchersFor(ro) : null;
    const plan = vigias ? buildRenderIdPlan(ro as never) : null;
    p = vigias && plan ? { vigias, plan } : null;
    preparados.set(ro, p);
    if (p === null) {
      stats.ineligible++;
    } else {
      const aoDescartar = ro.onDispose;
      ro.onDispose = () => {
        descartados.add(ro);
        aoDescartar();
      };
    }
    return p;
  };

  const gravar = (
    r: CleanDrawRendererLike, ro: CleanRoLike, scene: unknown, lightsNode: unknown, clipping: unknown, passId: unknown,
  ): void => {
    const p = preparar(ro);
    if (p === null || !snapshot(ro, p.vigias, scratch)) return;
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
        ro, material: ro.material, context: r._currentRenderContext, lights: lightsNode, clipping,
        envKey: undefined, contextNodeVersion: 0, vigias: p.vigias, instantaneo: new Float64Array(scratch.length), plan: p.plan,
      };
      porPasse.set(passId, g);
    }
    // Regravação no lugar: objeto que se move passa por aqui todo quadro.
    g.lights = lightsNode;
    g.clipping = clipping;
    g.envKey = chaveDeAmbiente(r, scene, lightsNode);
    g.contextNodeVersion = r.contextNode?.version ?? 0;
    if (g.instantaneo.length !== scratch.length) g.instantaneo = new Float64Array(scratch.length);
    for (let i = 0; i < scratch.length; i++) g.instantaneo[i] = scratch[i]!;
    stats.recorded++;
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
        debug('perf', `[cleanDraw] diretos=${stats.direct} three=${stats.three} gravados=${stats.recorded} inelegiveis=${stats.ineligible}`);
      }
    }
    const g = this._currentRenderBundle === null ? gravacaoDe(object as object, this._currentRenderContext, passId) : undefined;
    if (
      g !== undefined && !descartados.has(g.ro) && g.material === material && g.context === this._currentRenderContext &&
      matrizIgual(g.instantaneo, (object as ObjectLike).matrixWorld.elements) &&
      g.lights === lightsNode && g.clipping === clippingContext && g.ro.geometry === (object as ObjectLike).geometry &&
      g.contextNodeVersion === (this.contextNode?.version ?? 0) &&
      snapshot(g.ro, g.vigias, scratch) && iguais(g.instantaneo, scratch) &&
      chaveDeAmbiente(this, scene, lightsNode) === g.envKey
    ) {
      const ro = g.ro;
      ro.camera = camera;
      ro.drawRange = (object as ObjectLike).geometry.drawRange;
      ro.group = group;
      // O que o refresh do three garante para o render, deduplicado por ele
      // mesmo: `updateBefore`, nós de render/quadro e grupos compartilhados
      // (câmera, luzes). Sem isso a câmera congela (ADR-0215).
      nodes.updateBefore(ro);
      const frame = nodes.getNodeFrameForRender(ro);
      for (const n of g.plan.renderNodes) frame.updateNode(n);
      for (const grupo of g.plan.shared) bindings._update(grupo, g.plan.groups);
      ro.getMonitor().renderId = frame.renderId;
      if (pipelines.isReady(ro)) {
        drawOriginal.call(backend, ro, this.info);
        stats.direct++;
      }
      return;
    }
    ultimoDesenhado = null;
    original.call(this, object, material, scene, camera, lightsNode, group, clippingContext, passId);
    stats.three++;
    const desenhado = ultimoDesenhado as CleanRoLike | null;
    if (desenhado !== null && desenhado.object === object && this._currentRenderBundle === null) {
      gravar(this, desenhado, scene, lightsNode, clippingContext, passId);
    }
  };

  debug('perf', '[cleanDraw] instalado');
  return {
    stats,
    uninstall(): void {
      Reflect.deleteProperty(renderer, '_renderObjectDirect');
      backend.draw = drawOriginal;
    },
  };
}
