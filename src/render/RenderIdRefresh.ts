/**
 * Refresh por `renderId` só do que é por render (SPEC-0325, estende o ADR-0290).
 *
 * O `NodeMaterialObserver` do three refaz o PRIMEIRO render object de cada
 * monitor em todo `render()`, antes de olhar o `equals()`. Com material
 * exclusivo todo objeto é "primeiro": refaz tudo todo quadro sem nada mudar.
 *
 * Este wrapper faz, nesse caso, só o que esse refresh garante para o render
 * (updateBefore, nós RENDER/FRAME, bind groups compartilhados), marca o
 * `renderId` do monitor e deixa o `equals()` decidir. Parado, o objeto ainda
 * reavalia os nós de objeto não vigiados e compara o UBO do objeto (plano do
 * ADR-0290); o que deixa de ser refeito é só o que o `equals()` vigia.
 *
 * Instale DEPOIS do `TransformOnlyRefresh`: este fica por fora, e o objeto que
 * anda cai no caminho só de transformação com o `renderId` já em dia.
 */
import { debug } from '../core/debug.js';
import {
  applyPlan,
  buildTransformOnlyPlan,
  queryFlagRequested,
  type MonitorLike,
  type NodeFrameLike,
  type Plan,
  type RenderObjectLike,
  type UniformsGroupLike,
} from './TransformOnlyRefresh.js';

/** `NodeUpdateType.OBJECT` do three. */
const UPDATE_OBJECT = 'object';
/** Versão que nenhum atributo tem: força o refresh do three na primeira vez. */
const VERSION_UNSEEN = -1;
const QUERY_KEY = 'renderIdRefresh=';

// ── Forma mínima dos internos do three 0.184 usados aqui ────────────────────

interface UpdateNodeLike {
  getUpdateType(): string;
}

interface BindingLike {
  groupNode?: { shared?: boolean };
  isBuffer?: boolean;
  isUniformsGroup?: boolean;
}

interface BindGroupLike {
  bindings: BindingLike[];
}

interface RenderIdMonitorLike extends MonitorLike {
  renderObjects: MonitorLike['renderObjects'] & { has(renderObject: object): boolean };
}

interface RenderIdRenderObjectLike extends RenderObjectLike {
  object: RenderObjectLike['object'] & {
    isInstancedMesh?: boolean;
    isBatchedMesh?: boolean;
    instanceMatrix?: { version: number };
    instanceColor?: { version: number } | null;
  };
  getMonitor(): RenderIdMonitorLike;
}

interface RenderIdNodeManagerLike {
  needsRefresh(renderObject: RenderIdRenderObjectLike): boolean;
  getNodeFrameForRender(renderObject: RenderIdRenderObjectLike): NodeFrameLike;
  updateBefore(renderObject: RenderIdRenderObjectLike): void;
}

interface BindingsLike {
  _update(bindGroup: BindGroupLike, bindings: BindGroupLike[]): void;
}

/** Renderer do three visto por este módulo. */
export interface RenderIdRendererLike {
  _nodes?: unknown;
  _bindings?: unknown;
  backend?: { updateBinding?: (binding: UniformsGroupLike) => void };
}

// ── Plano por render object ─────────────────────────────────────────────────

interface RenderIdPlan {
  /** Nós de update que não são de objeto (câmera, luzes, tempo): deduplicados pelo `NodeFrame`. */
  renderNodes: UpdateNodeLike[];
  /** Bind groups compartilhados (`render`/`frame`). */
  shared: BindGroupLike[];
  groups: BindGroupLike[];
  /** Plano do ADR-0290 para o objeto parado. */
  object: Plan;
  /**
   * `InstancedMesh`: versões de `instanceMatrix`/`instanceColor` já enviadas por
   * um refresh do three. O `equals()` não as vigia, e só o refresh sobe o
   * atributo (muitas instâncias) ou o buffer de uniform (poucas).
   */
  instanceVersions: [number, number] | null;
}

const isShared = (group: BindGroupLike): boolean => group.bindings[0]?.groupNode?.shared === true;

/** `null` quando o objeto precisa de algo que só o refresh do three faz. */
export function buildRenderIdPlan(renderObject: RenderIdRenderObjectLike): RenderIdPlan | null {
  const object = renderObject.object;
  if (object.isBatchedMesh === true) return null;
  const instanced = object.isInstancedMesh === true;
  const state = renderObject.getNodeBuilderState();
  if (state.updateAfterNodes.length > 0) return null;
  const groups = renderObject.getBindings() as unknown as BindGroupLike[];
  for (const group of groups) {
    if (isShared(group)) continue;
    // O único buffer não-UBO aceito é o das matrizes de instância (vigiado por versão).
    for (const binding of group.bindings) if (binding.isBuffer === true && binding.isUniformsGroup !== true && !instanced) return null;
  }
  const objectPlan = buildTransformOnlyPlan(renderObject);
  if (objectPlan === null) return null;
  return {
    renderNodes: state.updateNodes.filter((node) => node.getUpdateType() !== UPDATE_OBJECT),
    shared: groups.filter(isShared),
    groups,
    object: objectPlan,
    instanceVersions: instanced ? [VERSION_UNSEEN, VERSION_UNSEEN] : null,
  };
}

/** `true` (e guarda as versões) quando matriz ou cor de instância mudaram desde o último refresh. */
function instancesChanged(object: RenderIdRenderObjectLike['object'], seen: [number, number]): boolean {
  const matrix = object.instanceMatrix?.version ?? VERSION_UNSEEN;
  const color = object.instanceColor?.version ?? VERSION_UNSEEN;
  if (matrix === seen[0] && color === seen[1] && matrix !== VERSION_UNSEEN) return false;
  seen[0] = matrix;
  seen[1] = color;
  return true;
}

// ── Instalação ───────────────────────────────────────────────────────────────

/** Handle do caminho instalado. */
export interface RenderIdRefresh {
  /** `skipped`: primeiro do monitor que não refez; `full`: caiu no refresh do three. */
  readonly stats: { skipped: number; full: number };
  /** Restaura o `needsRefresh` anterior. */
  uninstall(): void;
}

/**
 * Instala no renderer JÁ inicializado. Devolve `null`, sem tocar em nada, se a
 * forma dos internos não for a esperada (bump do three).
 */
export function installRenderIdRefresh(renderer: RenderIdRendererLike): RenderIdRefresh | null {
  const nodes = renderer._nodes as (RenderIdNodeManagerLike & Record<string, unknown>) | undefined;
  const bindings = renderer._bindings as BindingsLike | undefined;
  const updateBinding = renderer.backend?.updateBinding?.bind(renderer.backend);
  if (
    !nodes ||
    typeof nodes.needsRefresh !== 'function' ||
    typeof nodes.getNodeFrameForRender !== 'function' ||
    typeof nodes.updateBefore !== 'function' ||
    typeof bindings?._update !== 'function' ||
    !updateBinding
  ) {
    debug('perf', '[renderIdRefresh] internos do three ausentes: nao instalado');
    return null;
  }
  const hadOwn = Object.prototype.hasOwnProperty.call(nodes, 'needsRefresh');
  const previous = nodes['needsRefresh'];
  const inner = nodes.needsRefresh;
  const plans = new WeakMap<object, RenderIdPlan | null>();
  const stats = { skipped: 0, full: 0 };

  nodes.needsRefresh = function needsRefresh(this: RenderIdNodeManagerLike, renderObject: RenderIdRenderObjectLike): boolean {
    const monitor = renderObject.getMonitor();
    if (renderObject.bundle !== null || monitor.hasNode || monitor.hasAnimation || !monitor.renderObjects.has(renderObject)) {
      return inner.call(this, renderObject);
    }
    let frame = this.getNodeFrameForRender(renderObject);
    const renderId = frame.renderId;
    if (monitor.renderId === renderId || monitor.needsVelocity(frame.renderer)) return inner.call(this, renderObject);

    let plan = plans.get(renderObject);
    if (plan === undefined) {
      plan = buildRenderIdPlan(renderObject);
      plans.set(renderObject, plan);
    }
    if (plan === null) {
      stats.full++;
      return inner.call(this, renderObject);
    }
    if (plan.instanceVersions !== null && instancesChanged(renderObject.object, plan.instanceVersions)) {
      stats.full++;
      return inner.call(this, renderObject);
    }

    // Trabalho por render que o refresh do three faria (tudo deduplicado).
    this.updateBefore(renderObject);
    // A sombra renderiza aninhado e troca câmera/objeto do frame: busca de novo.
    frame = this.getNodeFrameForRender(renderObject);
    for (const node of plan.renderNodes) frame.updateNode(node as Parameters<NodeFrameLike['updateNode']>[0]);
    for (const group of plan.shared) bindings!._update(group, plan.groups);
    monitor.renderId = renderId;

    const data = monitor.renderObjects.get(renderObject);
    const parked = data !== undefined && data.worldMatrix.equals(renderObject.object.matrixWorld);
    if (inner.call(this, renderObject)) {
      stats.full++;
      return true;
    }
    // Andando, o caminho só de transformação já aplicou o plano.
    if (parked) applyPlan(this.getNodeFrameForRender(renderObject), plan.object, updateBinding);
    stats.skipped++;
    return false;
  };

  debug('perf', '[renderIdRefresh] instalado');
  return {
    stats,
    uninstall(): void {
      if (hadOwn) nodes['needsRefresh'] = previous;
      else Reflect.deleteProperty(nodes, 'needsRefresh');
    },
  };
}

/** Liga? Padrão do chamador (host nativo), sobreposto por `?renderIdRefresh=0|1`. */
export function renderIdRefreshRequested(fallback: boolean): boolean {
  return queryFlagRequested(QUERY_KEY, fallback);
}
