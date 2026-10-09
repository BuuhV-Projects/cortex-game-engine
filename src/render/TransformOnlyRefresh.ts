/**
 * Refresh só de transformação (ADR-0290 / SPEC-0291).
 *
 * O `NodeMaterialObserver` do three testa a matriz de mundo PRIMEIRO e retorna
 * na primeira diferença: um objeto que só anda paga o refresh completo (todos os
 * update nodes, todos os bindings), porque o three não sabe se o resto também
 * mudou. No host (Hermes sem JIT) isso custa ~180 µs por peça.
 *
 * Este módulo envolve `renderer._nodes.needsRefresh`: quando a única diferença
 * é a matriz, atualiza só o que não é leitura de material vigiado, escreve só
 * os UBOs de objeto (um `writeBuffer`) e devolve `false` — o three segue para
 * pipeline e draw como faria com o objeto parado.
 *
 * Contrato: o objeto recebe o que o three faria se ele estivesse PARADO, mais
 * os uniforms de transformação corretos. Qualquer outra mudança junto cai no
 * refresh completo de sempre.
 */
import { debug } from '../core/debug.js';

/** `NodeUpdateType.OBJECT` do three. */
const UPDATE_OBJECT = 'object';
const QUERY_KEY = 'transformOnlyRefresh=';

// ── Forma mínima dos internos do three 0.184 usados aqui ────────────────────

interface MatrixLike {
  equals(other: MatrixLike): boolean;
  copy(other: MatrixLike): MatrixLike;
}

interface NodeLike {
  getUpdateType(): string;
  getUpdateBeforeType(): string;
  getUpdateAfterType(): string;
  isMaterialReferenceNode?: boolean;
  property?: string;
  /** Saída interna de um `ReferenceNode` (o uniform que ele preenche). */
  node?: unknown;
}

interface UniformLike {
  nodeUniform?: { node?: unknown };
}

interface UniformRange {
  start: number;
  count: number;
}

export interface UniformsGroupLike {
  isUniformsGroup?: boolean;
  groupNode?: { shared?: boolean };
  uniforms: UniformLike[];
  updateRanges: UniformRange[];
  updateByType(uniform: UniformLike): boolean;
  addUpdateRange(start: number, count: number): void;
  clearUpdateRanges(): void;
}

export interface MonitorLike {
  hasNode: boolean;
  hasAnimation: boolean;
  renderId: number;
  refreshUniforms: readonly string[];
  renderObjects: { get(renderObject: object): { worldMatrix: MatrixLike } | undefined };
  needsVelocity(renderer: unknown): boolean;
}

export interface RenderObjectLike {
  object: { matrixWorld: MatrixLike; static?: boolean };
  bundle: unknown;
  getMonitor(): MonitorLike;
  getNodeBuilderState(): { updateNodes: NodeLike[]; updateBeforeNodes: NodeLike[]; updateAfterNodes: NodeLike[] };
  getBindings(): { bindings: unknown[] }[];
}

export interface NodeFrameLike {
  renderId: number;
  renderer: unknown;
  updateNode(node: NodeLike): void;
}

export interface NodeManagerLike {
  needsRefresh(renderObject: RenderObjectLike): boolean;
  getNodeFrameForRender(renderObject: RenderObjectLike): NodeFrameLike;
}

/** Renderer do three visto por este módulo. */
export interface TransformOnlyRendererLike {
  _nodes?: unknown;
  backend?: { updateBinding?: (binding: UniformsGroupLike) => void };
}

// ── Plano por render object ─────────────────────────────────────────────────

interface UboPlan {
  ubo: UniformsGroupLike;
  uniforms: UniformLike[];
}

export interface Plan {
  nodes: NodeLike[];
  ubos: UboPlan[];
}

/**
 * Monta o plano: os nodes de objeto a atualizar e os uniforms a comparar.
 * `null` quando o objeto precisa de trabalho por objeto que o plano não cobre.
 */
export function buildTransformOnlyPlan(renderObject: RenderObjectLike): Plan | null {
  const state = renderObject.getNodeBuilderState();
  for (const node of state.updateBeforeNodes) if (node.getUpdateBeforeType() === UPDATE_OBJECT) return null;
  for (const node of state.updateAfterNodes) if (node.getUpdateAfterType() === UPDATE_OBJECT) return null;

  const tracked = new Set(renderObject.getMonitor().refreshUniforms);
  const nodes: NodeLike[] = [];
  // Saídas dos nodes que NÃO serão atualizados: são instâncias compartilhadas
  // e guardam o valor do último material que passou por elas, então comparar
  // o uniform sem atualizar a fonte escreveria o valor de outro objeto.
  const skipped = new Set<unknown>();
  for (const node of state.updateNodes) {
    if (node.getUpdateType() !== UPDATE_OBJECT) continue;
    if (node.isMaterialReferenceNode === true && tracked.has(String(node.property).split('.')[0])) {
      if (node.node) skipped.add(node.node);
      continue;
    }
    nodes.push(node);
  }

  const ubos: UboPlan[] = [];
  for (const group of renderObject.getBindings()) {
    for (const binding of group.bindings as UniformsGroupLike[]) {
      if (binding.isUniformsGroup !== true || binding.groupNode?.shared === true) continue;
      ubos.push({ ubo: binding, uniforms: binding.uniforms.filter((uniform) => !skipped.has(uniform.nodeUniform?.node)) });
    }
  }
  return { nodes, ubos };
}

/** Aplica o plano: atualiza os nodes e escreve cada UBO alterado num `writeBuffer`. */
export function applyPlan(frame: NodeFrameLike, plan: Plan, updateBinding: (binding: UniformsGroupLike) => void): void {
  for (const node of plan.nodes) frame.updateNode(node);
  for (const { ubo, uniforms } of plan.ubos) {
    let updated = false;
    for (const uniform of uniforms) if (ubo.updateByType(uniform)) updated = true;
    if (!updated) continue;
    mergeRanges(ubo);
    updateBinding(ubo);
    ubo.clearUpdateRanges();
  }
}

/** Funde as faixas alteradas numa só (o meio tem os mesmos bytes): uma travessia de ponte por UBO. */
function mergeRanges(ubo: UniformsGroupLike): void {
  const ranges = ubo.updateRanges;
  if (ranges.length < 2) return;
  let start = Number.POSITIVE_INFINITY;
  let end = 0;
  for (const range of ranges) {
    start = Math.min(start, range.start);
    end = Math.max(end, range.start + range.count);
  }
  ubo.clearUpdateRanges();
  ubo.addUpdateRange(start, end - start);
}

// ── Instalação ───────────────────────────────────────────────────────────────

/** Handle do caminho rápido instalado. */
export interface TransformOnlyRefresh {
  /** `fast`: caminho rápido aplicado; `full`: objeto que andou e caiu no refresh completo. */
  readonly stats: { fast: number; full: number };
  /** Restaura o `needsRefresh` do three. */
  uninstall(): void;
}

/**
 * Instala o caminho rápido no renderer JÁ inicializado (os colaboradores
 * internos só existem depois do `init()`). Devolve `null`, sem tocar em nada,
 * se a forma dos internos não for a esperada — um bump do three pode mudar.
 */
export function installTransformOnlyRefresh(renderer: TransformOnlyRendererLike): TransformOnlyRefresh | null {
  const nodes = renderer._nodes as (NodeManagerLike & Record<string, unknown>) | undefined;
  const updateBinding = renderer.backend?.updateBinding?.bind(renderer.backend);
  if (!nodes || typeof nodes.needsRefresh !== 'function' || typeof nodes.getNodeFrameForRender !== 'function' || !updateBinding) {
    debug('perf', '[transformOnlyRefresh] internos do three ausentes: nao instalado');
    return null;
  }
  const hadOwn = Object.prototype.hasOwnProperty.call(nodes, 'needsRefresh');
  const previous = nodes['needsRefresh'];
  const original = nodes.needsRefresh;
  const plans = new WeakMap<object, Plan | null>();
  const stats = { fast: 0, full: 0 };

  nodes.needsRefresh = function needsRefresh(this: NodeManagerLike, renderObject: RenderObjectLike): boolean {
    const monitor = renderObject.getMonitor();
    const object = renderObject.object;
    if (renderObject.bundle !== null || object.static === true || monitor.hasNode || monitor.hasAnimation) {
      return original.call(this, renderObject);
    }
    const data = monitor.renderObjects.get(renderObject);
    if (data === undefined || data.worldMatrix.equals(object.matrixWorld)) return original.call(this, renderObject);
    const frame = this.getNodeFrameForRender(renderObject);
    if (monitor.renderId !== frame.renderId || monitor.needsVelocity(frame.renderer)) return original.call(this, renderObject);

    let plan = plans.get(renderObject);
    if (plan === undefined) {
      plan = buildTransformOnlyPlan(renderObject);
      plans.set(renderObject, plan);
    }
    if (plan === null) {
      stats.full++;
      return original.call(this, renderObject);
    }
    // Com a matriz sincronizada, o observer compara o resto como faria com o
    // objeto parado: `true` aqui é outra mudança junto → refresh completo.
    data.worldMatrix.copy(object.matrixWorld);
    if (original.call(this, renderObject)) {
      stats.full++;
      return true;
    }
    applyPlan(this.getNodeFrameForRender(renderObject), plan, updateBinding);
    stats.fast++;
    return false;
  };

  debug('perf', '[transformOnlyRefresh] instalado');
  return {
    stats,
    uninstall(): void {
      if (hadOwn) nodes['needsRefresh'] = previous;
      else Reflect.deleteProperty(nodes, 'needsRefresh');
    },
  };
}

/**
 * Liga o caminho rápido? Padrão do chamador (host nativo), sobreposto por
 * `?transformOnlyRefresh=0|1`.
 */
export function transformOnlyRefreshRequested(fallback: boolean): boolean {
  return queryFlagRequested(QUERY_KEY, fallback);
}

/** Lê `?<chave>0|1` da URL; sem a chave (ou sem `location`), devolve `fallback`. */
export function queryFlagRequested(key: string, fallback: boolean): boolean {
  try {
    if (typeof location === 'undefined') return fallback;
    const search = location.search ?? '';
    const at = search.indexOf(key);
    if (at < 0) return fallback;
    return search.charAt(at + key.length) !== '0';
  } catch {
    return fallback;
  }
}
