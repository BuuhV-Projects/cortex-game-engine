/**
 * RS1b of the RenderingServer (SPEC-0425, ADR-0404): clean opaque instances
 * leave the three's RenderList.
 *
 * The ceiling experiment of ADR-0404 showed that the cost of a draw in the
 * export is the whole per-object JS loop around it (RenderList push and sort,
 * `renderObject`, the b.1 wrapper, per-object `WeakMap` lookups, draw params,
 * `info.update`), not the snapshot check. Here, per clean instance and per
 * frame, only two things run in JS: the b.1 snapshot check (in the projection)
 * and 4 ints appended to a command list. Everything else is cached on the
 * instance or done once per shader state per `render()` call, and the list is
 * drawn by the C++ batch (b.2) in one bridge crossing.
 *
 * Eligible: plain mesh (native culling), single opaque material with depth
 * test/write and color write, no `polygonOffset`, `renderOrder` 0, no own
 * `onBeforeRender`/`onAfterRender`, a valid b.1 recording and a live b.2
 * recipe. Opaque draws with depth test and write give the same image in any
 * order (except exact depth ties), so the list is emitted as one block: after
 * the background and the `renderOrder` < 0 items, before the first other
 * opaque item of the three. Anything else stays with the three, per object.
 */
import { Object3D } from 'three';
import { debug } from '../core/debug.js';
import type { DrawBatch, ServerRecipe } from './DrawBatch.js';
import { queryFlagRequested } from './TransformOnlyRefresh.js';

const QUERY_KEY = 'renderServer=';
/** Ints per command (`kCommandInts` in `draw_batch.h`). */
const COMMAND_INTS = 4;
const INITIAL_COMMANDS = 256;
const TRIANGLE_VERTICES = 3;
/** `render()` calls between reports on `debug('perf')`. */
const REPORT_CALLS = 1200;

/** On? Off by default until the acceptance A/B (SPEC-0425); `?renderServer=1` turns it on. */
export function renderServerRequested(fallback = false): boolean {
  return queryFlagRequested(QUERY_KEY, fallback);
}

// ── Shapes of the b.1 data and the three 0.184 internals used here ──────────

interface ServerRoLike {
  object: Object3D & { geometry: unknown; isMesh?: boolean };
  geometry: unknown;
  camera: unknown;
  getNodeBuilderState(): object;
  getBindings(): unknown[];
  getDrawParameters(): { vertexCount: number; firstVertex: number; instanceCount: number } | null;
}

/** A b.1 recording, as the server reads it (`Gravacao` in `CleanDrawFastPath`). */
export interface ServerRecording {
  ro: ServerRoLike;
  material: unknown;
  clipping: unknown;
  lights: unknown;
  envKey: unknown;
  contextNodeVersion: number;
  /** Cached instance (or `null` = not eligible); reset by the b.1 on re-recording. */
  server?: ServerInstance | null;
}

/** What the b.1 lends to the server (closures of `installCleanDrawFastPath`). */
export interface ServerAccess {
  /** The recording for the main pass (`passId` null) in this render context. */
  recordingOf(object: object, context: unknown): ServerRecording | undefined;
  disposed(ro: object): boolean;
  /** The snapshot check of the b.1, split at the matrix: `clean` / `moved` / `dirty`. */
  check(g: ServerRecording): CheckResult;
  /** Per shader state per call: updateBefore, render nodes, shared refs, shared groups. */
  prepareCall(r: ServerRendererLike, g: ServerRecording, calls: number): void;
  envKey(r: ServerRendererLike, scene: unknown, lightsNode: unknown): unknown;
  /** Applies the transform plan of a moved instance; `false` = needs the three. */
  applyMoved(r: ServerRendererLike, g: ServerRecording): boolean;
  readonly batch: DrawBatch;
}

export const enum CheckResult {
  Clean = 0,
  Moved = 1,
  Dirty = 2,
}

export interface ServerRendererLike {
  _currentRenderContext?: unknown;
  _currentRenderObjectFunction?: (...args: unknown[]) => void;
  _renderObjects?: (list: RenderItemLike[], camera: unknown, scene: unknown, lightsNode: unknown, passId?: unknown) => void;
  _renderTransparents?: (...args: unknown[]) => void;
  info?: { calls?: number; render?: { drawCalls: number; triangles: number } };
  contextNode?: { version: number };
  backend?: { get(o: unknown): Record<string, unknown>; finishRender?: (...args: unknown[]) => void };
}

interface RenderItemLike {
  object: Object3D;
  geometry: unknown;
  material: unknown;
  group: unknown;
  clippingContext: unknown;
}

/** What is cached per instance: the command and what the emission checks. */
export interface ServerInstance {
  recipe: ServerRecipe;
  count: number;
  first: number;
  triangles: number;
  state: object;
}

export interface RenderServerStats {
  /** Instances drawn by the server. */
  drawn: number;
  /** Of those, the ones that moved (transform plan applied). */
  moved: number;
  /** Offered but sent back to the three (dirty, not eligible, stale). */
  refused: number;
  /** Taken in the projection but drawn by the three at emission (lights/env/shared group changed). */
  fallback: number;
  /** Lists dropped without a draw (projection without render, e.g. `compileAsync`). */
  dropped: number;
}

const Object3DProto = Object3D.prototype;

/** Static eligibility of an instance; `null` = stays with the three. */
export function buildServerInstance(g: ServerRecording, batch: DrawBatch): ServerInstance | null {
  const ro = g.ro;
  const o = ro.object as Object3D & {
    isMesh?: boolean; isInstancedMesh?: boolean; isSkinnedMesh?: boolean; isBatchedMesh?: boolean;
    morphTargetInfluences?: unknown;
  };
  if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.isBatchedMesh || o.morphTargetInfluences) return null;
  if (o.onBeforeRender !== Object3DProto.onBeforeRender || o.onAfterRender !== Object3DProto.onAfterRender) return null;
  const m = g.material as {
    transparent?: boolean; transmission?: number; depthTest?: boolean; depthWrite?: boolean; colorWrite?: boolean;
    polygonOffset?: boolean; transmissionNode?: unknown; backdropNode?: unknown;
  };
  if (m.transparent || (m.transmission ?? 0) > 0 || m.transmissionNode || m.backdropNode) return null;
  if (m.depthTest === false || m.depthWrite === false || m.colorWrite === false || m.polygonOffset) return null;
  const recipe = batch.recipeOf(ro as never);
  if (!recipe) return null;
  const params = ro.getDrawParameters();
  if (params === null || params.instanceCount !== 1) return null;
  return {
    recipe,
    count: params.vertexCount,
    first: params.firstVertex,
    triangles: params.vertexCount / TRIANGLE_VERTICES,
    state: ro.getNodeBuilderState(),
  };
}

/**
 * The server. One per renderer. The projection calls {@link offer} per
 * candidate; the wrappers installed by {@link install} emit the list inside
 * the pass of the render that built it.
 */
export class RenderServer {
  readonly stats: RenderServerStats = { drawn: 0, moved: 0, refused: 0, fallback: 0, dropped: 0 };
  private _items: ServerRecording[] = [];
  private _moved: boolean[] = [];
  private _owner: unknown = null;
  private _ownerList: unknown = null;
  private _emitting = false;
  private _commands = new Int32Array(INITIAL_COMMANDS * COMMAND_INTS);
  /** Per shader state: last call prepared, and the shared group handles seen then. */
  private readonly _prepared = new WeakMap<object, { calls: number; shared: unknown[] }>();
  private readonly _fallback: ServerRecording[] = [];
  private _reportCalls = -1;

  constructor(private readonly _access: ServerAccess) {}

  /**
   * Start of a top-level projection of the mirrored scene (not a shadow pass).
   * A list never emitted (projection without a render) is dropped.
   */
  beginProjection(r: ServerRendererLike, renderList: unknown): boolean {
    if (this._emitting) return false;
    if (this._items.length > 0) {
      this.stats.dropped++;
      this._items.length = 0;
      this._moved.length = 0;
    }
    this._owner = r._currentRenderContext;
    this._ownerList = renderList;
    return true;
  }

  /** `true` = the candidate went to the server list (not to the RenderList). */
  offer(object: Object3D, material: unknown, geometry: unknown, clipping: unknown): boolean {
    const g = this._access.recordingOf(object, this._owner);
    if (
      g === undefined || g.material !== material || g.ro.geometry !== geometry || g.clipping !== clipping ||
      object.renderOrder !== 0 || this._access.disposed(g.ro)
    ) {
      return false;
    }
    let inst = g.server;
    if (inst === undefined) inst = g.server = buildServerInstance(g, this._access.batch);
    if (inst === null) return false;
    const r = this._access.check(g);
    if (r === CheckResult.Dirty) {
      this.stats.refused++;
      return false;
    }
    this._items.push(g);
    this._moved.push(r === CheckResult.Moved);
    return true;
  }

  /** Emits the pending list now, if `r` is in the render that owns it. */
  emit(r: ServerRendererLike, scene: unknown, camera: unknown, lightsNode: unknown): void {
    const n = this._items.length;
    if (n === 0 || this._emitting || r._currentRenderContext !== this._owner) return;
    this._emitting = true;
    try {
      this._emitList(r, scene, camera, lightsNode, n);
    } finally {
      this._items.length = 0;
      this._moved.length = 0;
      this._emitting = false;
    }
  }

  private _emitList(r: ServerRendererLike, scene: unknown, camera: unknown, lightsNode: unknown, n: number): void {
    const a = this._access;
    const calls = r.info?.calls ?? 0;
    const env = a.envKey(r, scene, lightsNode);
    const contextNodeVersion = r.contextNode?.version ?? 0;
    const backend = r.backend!;
    let cmds = this._commands;
    if (cmds.length < n * COMMAND_INTS) cmds = this._commands = new Int32Array(n * COMMAND_INTS * 2);
    let k = 0;
    let triangles = 0;
    const fallback = this._fallback;
    fallback.length = 0;
    for (let i = 0; i < n; i++) {
      const g = this._items[i]!;
      const inst = g.server!;
      if (g.lights !== lightsNode || g.envKey !== env || g.contextNodeVersion !== contextNodeVersion) {
        fallback.push(g);
        continue;
      }
      g.ro.camera = camera;
      let p = this._prepared.get(inst.state);
      if (p === undefined || p.calls !== calls) {
        a.prepareCall(r, g, calls);
        p = { calls, shared: sharedHandles(backend, g.ro, inst.recipe) };
        this._prepared.set(inst.state, p);
      }
      if (!sameShared(inst.recipe, p.shared)) {
        fallback.push(g);
        continue;
      }
      if (this._moved[i]) {
        if (!a.applyMoved(r, g)) {
          fallback.push(g);
          continue;
        }
        this.stats.moved++;
      }
      const base = k * COMMAND_INTS;
      cmds[base] = inst.recipe.id;
      cmds[base + 1] = inst.count;
      cmds[base + 2] = 1;
      cmds[base + 3] = inst.first;
      k++;
      triangles += inst.triangles;
    }
    if (k > 0) {
      const contextData = backend.get(this._owner);
      a.batch.emitCommands(contextData['currentPass'], contextData, cmds, k);
      const info = r.info?.render;
      if (info) {
        info.drawCalls += k;
        info.triangles += triangles;
      }
      this.stats.drawn += k;
    }
    // Changed under the server: the three draws them here (opaque: order-free).
    const draw = r._currentRenderObjectFunction;
    for (let i = 0; i < fallback.length; i++) {
      const g = fallback[i]!;
      const o = g.ro.object;
      draw?.call(r, o, scene, camera, o.geometry, g.material, null, lightsNode, g.clipping, null);
      this.stats.fallback++;
    }
    fallback.length = 0;
    if (calls !== this._reportCalls && calls % REPORT_CALLS === 0) {
      this._reportCalls = calls;
      const s = this.stats;
      debug('perf', `[renderServer] drawn=${s.drawn} moved=${s.moved} refused=${s.refused} fallback=${s.fallback} dropped=${s.dropped}`);
    }
  }

  /** Is this RenderList the one the pending list was offered from? */
  ownsList(list: unknown): boolean {
    return this._items.length > 0 && list === this._ownerList;
  }

  /**
   * Installs the emission points on the renderer. Returns the uninstaller.
   * `_renderObjects` of the owner's opaque list: after the background and the
   * `renderOrder` < 0 items, before the rest; `_renderTransparents` and
   * `finishRender` emit what is left (no opaque item of the three).
   */
  install(r: ServerRendererLike): () => void {
    const renderObjects = r._renderObjects;
    const renderTransparents = r._renderTransparents;
    const backend = r.backend;
    const finishRender = backend?.finishRender;
    if (typeof renderObjects !== 'function' || typeof renderTransparents !== 'function' || !backend || !finishRender) {
      debug('perf', '[renderServer] three internals missing: not installed');
      return () => undefined;
    }
    const server = this;
    let lastScene: unknown = null;
    let lastCamera: unknown = null;
    let lastLights: unknown = null;
    r._renderObjects = function renderObjectsWithServer(
      this: ServerRendererLike, list: RenderItemLike[], camera: unknown, scene: unknown, lightsNode: unknown, passId?: unknown,
    ): void {
      if (passId != null || this._currentRenderContext !== server._owner || !server._ownsOpaque(list)) {
        renderObjects.call(this, list, camera, scene, lightsNode, passId);
        return;
      }
      lastScene = scene;
      lastCamera = camera;
      lastLights = lightsNode;
      const draw = this._currentRenderObjectFunction!;
      // Fixed length at entry, like the three (ADR-0363, trap 5).
      for (let i = 0, il = list.length; i < il; i++) {
        const { object, geometry, material, group, clippingContext } = list[i]!;
        if (server._items.length > 0 && object.renderOrder >= 0 && object.parent !== null) {
          server.emit(this, scene, camera, lightsNode);
        }
        draw.call(this, object, scene, camera, geometry, material, group, lightsNode, clippingContext, passId);
      }
      server.emit(this, scene, camera, lightsNode);
    };
    r._renderTransparents = function renderTransparentsWithServer(this: ServerRendererLike, ...args: unknown[]): void {
      if (this._currentRenderContext === server._owner) server.emit(this, args[3], args[2], args[4]);
      renderTransparents.apply(this, args);
    };
    backend.finishRender = function finishRenderWithServer(this: unknown, ...args: unknown[]): void {
      // Only a list whose render had no item of the three at all reaches here.
      if (args[0] === server._owner && server._items.length > 0 && lastScene !== null) {
        server.emit(r, lastScene, lastCamera, lastLights);
      }
      finishRender.apply(this, args);
    };
    debug('perf', '[renderServer] installed');
    return () => {
      r._renderObjects = renderObjects;
      r._renderTransparents = renderTransparents;
      backend.finishRender = finishRender;
    };
  }

  private _ownsOpaque(list: unknown): boolean {
    const owner = this._ownerList as { opaque?: unknown } | null;
    return this._items.length > 0 && owner !== null && owner.opaque === list;
  }
}

/** The current handles of the shared groups (camera, lights) of the recipe. */
function sharedHandles(backend: { get(o: unknown): Record<string, unknown> }, ro: ServerRoLike, recipe: ServerRecipe): unknown[] {
  const bindings = ro.getBindings();
  const out: unknown[] = [];
  for (let k = 0; k < recipe.compartilhados.length; k++) out.push(backend.get(bindings[recipe.compartilhados[k]!])['group']);
  return out;
}

/** The recipe was recorded with the shared groups the three has now? */
function sameShared(recipe: ServerRecipe, handles: unknown[]): boolean {
  const idx = recipe.compartilhados;
  if (idx.length !== handles.length) return false;
  for (let k = 0; k < idx.length; k++) if (recipe.grupos[idx[k]!] !== handles[k]) return false;
  return true;
}

let current: RenderServer | null = null;

/** The server of the running renderer (the projection asks for it). */
export function activeRenderServer(): RenderServer | null {
  return current;
}

export function setActiveRenderServer(server: RenderServer | null): void {
  current = server;
}
