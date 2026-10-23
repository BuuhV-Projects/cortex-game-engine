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
/** Projections between reports on `debug('perf')`. */
const REPORT_PROJECTIONS = 600;

/**
 * On? On by default in the native host — the only place it is installed (inside
 * the b.1, which only the host installs; the Studio stays on the three). The
 * user turned it on on 2026-10-23 below the -4 ms criterion (SPEC-0425).
 * `?renderServer=0` turns it off.
 */
export function renderServerRequested(fallback = true): boolean {
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

interface RenderItemLike extends SortKeyLike {
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
  /** Candidates offered by the projection / taken into the list. */
  offered: number;
  taken: number;
  /** Lists fully emitted. */
  emissions: number;
  /** Fallback reasons: lights/environment/context node changed, stale shared group, moved needs the three. */
  fbEnv: number;
  fbShared: number;
  fbMoved: number;
  /** Recipes re-recorded at emission because a shared group was recreated. */
  recaptured: number;
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
  readonly stats: RenderServerStats = {
    drawn: 0, moved: 0, refused: 0, fallback: 0, dropped: 0, offered: 0, taken: 0, emissions: 0,
    fbEnv: 0, fbShared: 0, fbMoved: 0, recaptured: 0,
  };
  private _items: ServerRecording[] = [];
  private _moved: boolean[] = [];
  private _z: number[] = [];
  private _owner: unknown = null;
  private _ownerList: unknown = null;
  /** Inside a nested call made while emitting (shadow updateBefore, fallback draw). */
  private _emitting = false;
  // The prepared list, in the three's sort order (`painterSortStable`).
  private _prepared = false;
  private _order: number[] = [];
  /** Per sorted entry: command index, or `FALLBACK` = drawn by the three at its place. */
  private _slot = new Int32Array(INITIAL_COMMANDS);
  private _cursor = 0;
  private _commands = new Int32Array(INITIAL_COMMANDS * COMMAND_INTS);
  private _scene: unknown = null;
  private _camera: unknown = null;
  private _lights: unknown = null;
  /** Per shader state: last call prepared, and the shared group handles seen then. */
  private readonly _states = new WeakMap<object, { calls: number; shared: unknown[] }>();
  private _projections = 0;
  private readonly _byKey = (i: number, j: number): number => {
    const zi = this._z[i]!;
    const zj = this._z[j]!;
    return zi !== zj ? zi - zj : this._items[i]!.ro.object.id - this._items[j]!.ro.object.id;
  };

  constructor(private readonly _access: ServerAccess) {}

  /**
   * Start of a top-level projection of the mirrored scene (not a shadow pass).
   * A list never emitted (projection without a render) is dropped.
   */
  beginProjection(r: ServerRendererLike, renderList: unknown): boolean {
    if (this._emitting) return false;
    this._report();
    if (this._items.length > 0) {
      this.stats.dropped++;
      this._clear();
    }
    this._owner = r._currentRenderContext;
    this._ownerList = renderList;
    return true;
  }

  /**
   * `true` = the candidate went to the server list (not to the RenderList).
   * `z` is the sort depth the three would use (from the native projection).
   */
  offer(object: Object3D, material: unknown, geometry: unknown, clipping: unknown, z: number): boolean {
    this.stats.offered++;
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
    this._z.push(z);
    this.stats.taken++;
    return true;
  }

  /**
   * Emits, in the owner's pass, the server entries whose sort key is below
   * `next` (a render item of the three), or all of them with `next` null.
   * Identical keys to the three's sort = identical draw order, so coplanar
   * geometry resolves its depth ties exactly as the three does.
   */
  emitBefore(r: ServerRendererLike, scene: unknown, camera: unknown, lightsNode: unknown, next: SortKeyLike | null): void {
    if (this._items.length === 0 || this._emitting || r._currentRenderContext !== this._owner) return;
    this._emitting = true;
    try {
      if (!this._prepared) this._prepare(r, scene, camera, lightsNode);
      this._emitUntil(r, next);
    } finally {
      this._emitting = false;
    }
    if (this._cursor >= this._order.length) {
      this.stats.emissions++;
      this._clear();
    }
  }

  private _clear(): void {
    this._items.length = 0;
    this._moved.length = 0;
    this._z.length = 0;
    this._order.length = 0;
    this._prepared = false;
    this._cursor = 0;
  }

  /** Once per list: shader states, recipes, moved plans, refusals, commands in sort order. */
  private _prepare(r: ServerRendererLike, scene: unknown, camera: unknown, lightsNode: unknown): void {
    const a = this._access;
    const n = this._items.length;
    const calls = r.info?.calls ?? 0;
    const env = a.envKey(r, scene, lightsNode);
    const contextNodeVersion = r.contextNode?.version ?? 0;
    const backend = r.backend!;
    this._scene = scene;
    this._camera = camera;
    this._lights = lightsNode;
    const order = this._order;
    order.length = n;
    for (let i = 0; i < n; i++) order[i] = i;
    order.sort(this._byKey);
    if (this._slot.length < n) this._slot = new Int32Array(n * 2);
    if (this._commands.length < n * COMMAND_INTS) this._commands = new Int32Array(n * COMMAND_INTS * 2);
    const cmds = this._commands;
    let k = 0;
    for (let s = 0; s < n; s++) {
      const i = order[s]!;
      const g = this._items[i]!;
      this._slot[s] = FALLBACK;
      const inst = g.server!;
      if (g.lights !== lightsNode || g.envKey !== env || g.contextNodeVersion !== contextNodeVersion) {
        this.stats.fbEnv++;
        continue;
      }
      g.ro.camera = camera;
      let st = this._states.get(inst.state);
      if (st === undefined || st.calls !== calls) {
        a.prepareCall(r, g, calls);
        st = { calls, shared: sharedHandles(backend, g.ro, inst.recipe) };
        this._states.set(inst.state, st);
      }
      if (!sameShared(inst.recipe, st.shared)) {
        // The three recreated a shared bind group (texture generation, sampler):
        // re-record the recipe from the current handles (~µs) instead of a full
        // draw by the three (~100 µs). Still stale = the three draws it.
        const recipe = a.batch.recapture(g.ro as never);
        if (recipe === undefined || !sameShared(recipe, st.shared)) {
          this.stats.fbShared++;
          continue;
        }
        inst.recipe = recipe;
        this.stats.recaptured++;
      }
      if (this._moved[i]) {
        if (!a.applyMoved(r, g)) {
          this.stats.fbMoved++;
          continue;
        }
        this.stats.moved++;
      }
      const base = k * COMMAND_INTS;
      cmds[base] = inst.recipe.id;
      cmds[base + 1] = inst.count;
      cmds[base + 2] = 1;
      cmds[base + 3] = inst.first;
      this._slot[s] = k++;
    }
    this._prepared = true;
  }

  private _emitUntil(r: ServerRendererLike, next: SortKeyLike | null): void {
    const order = this._order;
    const n = order.length;
    let s = this._cursor;
    let runStart = -1;
    let runCount = 0;
    let triangles = 0;
    while (s < n) {
      const i = order[s]!;
      const g = this._items[i]!;
      if (next !== null && !keyBelow(this._z[i]!, g.ro.object.id, next)) break;
      const k = this._slot[s]!;
      if (k === FALLBACK) {
        triangles = this._flushRun(r, runStart, runCount, triangles);
        runStart = -1;
        runCount = 0;
        const o = g.ro.object;
        r._currentRenderObjectFunction?.call(r, o, this._scene, this._camera, o.geometry, g.material, null, this._lights, g.clipping, null);
        this.stats.fallback++;
      } else {
        if (runStart < 0) runStart = k;
        runCount++;
        triangles += g.server!.triangles;
      }
      s++;
    }
    this._flushRun(r, runStart, runCount, triangles);
    this._cursor = s;
  }

  /** One bridge crossing for a run of contiguous commands; returns 0 (the reset triangle sum). */
  private _flushRun(r: ServerRendererLike, start: number, count: number, triangles: number): number {
    if (count === 0) return 0;
    const contextData = r.backend!.get(this._owner);
    const view = start === 0 ? this._commands : this._commands.subarray(start * COMMAND_INTS);
    this._access.batch.emitCommands(contextData['currentPass'], contextData, view, count);
    const info = r.info?.render;
    if (info) {
      info.drawCalls += count;
      info.triangles += triangles;
    }
    this.stats.drawn += count;
    return 0;
  }

  private _report(): void {
    const s = this.stats;
    if (++this._projections % REPORT_PROJECTIONS === 0) {
      debug(
        'perf',
        `[renderServer] emissions=${s.emissions} offered=${s.offered} taken=${s.taken} drawn=${s.drawn} moved=${s.moved} ` +
          `refused=${s.refused} fallback=${s.fallback} (env=${s.fbEnv} shared=${s.fbShared} moved=${s.fbMoved}) recaptured=${s.recaptured} dropped=${s.dropped}`,
      );
    }
  }

  /**
   * Installs the emission points on the renderer. Returns the uninstaller.
   * `_renderObjects` of the owner's opaque list: before each item of the three,
   * the server entries with a lower sort key (the background, not a scene node,
   * never triggers it); `_renderTransparents` and `finishRender` emit the rest.
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
        const item = list[i]!;
        if (server._items.length > 0 && item.object.parent !== null) server.emitBefore(this, scene, camera, lightsNode, item);
        draw.call(this, item.object, scene, camera, item.geometry, item.material, item.group, lightsNode, item.clippingContext, passId);
      }
      server.emitBefore(this, scene, camera, lightsNode, null);
    };
    r._renderTransparents = function renderTransparentsWithServer(this: ServerRendererLike, ...args: unknown[]): void {
      if (this._currentRenderContext === server._owner) server.emitBefore(this, args[3], args[2], args[4], null);
      renderTransparents.apply(this, args);
    };
    backend.finishRender = function finishRenderWithServer(this: unknown, ...args: unknown[]): void {
      // Only a list whose render had no item of the three at all reaches here.
      if (args[0] === server._owner && server._items.length > 0 && lastScene !== null) {
        server.emitBefore(r, lastScene, lastCamera, lastLights, null);
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

/** The fields of a three render item that `painterSortStable` compares. */
export interface SortKeyLike {
  groupOrder: number;
  renderOrder: number;
  z: number;
  id: number;
}

/** A server entry (group order 0, render order 0) sorts before `next`? (`painterSortStable`) */
export function keyBelow(z: number, id: number, next: SortKeyLike): boolean {
  if (next.groupOrder !== 0) return next.groupOrder > 0;
  if (next.renderOrder !== 0) return next.renderOrder > 0;
  if (z !== next.z) return z < next.z;
  return id < next.id;
}

/** Sorted entry drawn by the three at its place (lights/env changed, stale recipe, moved needs the three). */
const FALLBACK = -1;

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
