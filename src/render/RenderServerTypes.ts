/**
 * Shapes of the RenderingServer (SPEC-0425, ADR-0404) and its static helpers: what the b.1 lends,
 * what the native renderer (ADR-0465) gives, the sort key and the per-instance eligibility. Split
 * out of `RenderServer.ts` (SPEC-0682, SPEC-0668); `RenderServer.ts` re-exports all of it.
 */
import { Object3D } from 'three';
import type { DrawBatch, ServerRecipe } from './DrawBatch.js';
import type { CheckResult } from './RenderServer.js';

const TRIANGLE_VERTICES = 3;
/** "No world version" (SPEC-0682): the host never gives 0 or a negative version. */
export const NO_VERSION = -1;

// ── Shapes of the b.1 data and the three 0.184 internals used here ──────────

export interface ServerRoLike {
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
  /**
   * The snapshot check of the b.1, split at the matrix: `clean` / `moved` / `dirty`. With the
   * candidate's world `version` (SPEC-0682) equal to the one adopted, the matrix part is skipped.
   */
  check(g: ServerRecording, version: number): CheckResult;
  /** Per shader state per call: updateBefore, render nodes, shared refs, shared groups. */
  prepareCall(r: ServerRendererLike, g: ServerRecording, calls: number): void;
  envKey(r: ServerRendererLike, scene: unknown, lightsNode: unknown): unknown;
  /** Applies the transform plan of a moved instance; `false` = needs the three. */
  applyMoved(r: ServerRendererLike, g: ServerRecording): boolean;
  readonly batch: DrawBatch;
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

export interface RenderItemLike extends SortKeyLike {
  object: Object3D;
  geometry: unknown;
  material: unknown;
  group: unknown;
  clippingContext: unknown;
}

/** A draw owned by the native renderer (ADR-0465): what the list needs to emit it. */
export interface NativeEntry {
  readonly count: number;
  readonly first: number;
  readonly triangles: number;
  /** Instances per draw (`InstancedMesh.count`); absent = 1, 0 = nothing to draw (SPEC-0555). */
  readonly instances?: number;
  /** Draws per entry: 2 = transparent `DoubleSide` (back faces, then front, like the three). */
  readonly passes?: number;
  /** In the three's transparent list (`material.transparent`): `reversePainterSortStable` order. */
  readonly transparent?: boolean;
}

/**
 * The native renderer as the list sees it (`src/render/native/NativeRenderer.ts`). It takes an
 * object (its own geometry, material, pipeline) or returns `null` and the object goes on as before.
 */
export interface NativeDrawer {
  /** Once per top-level projection of the mirrored scene: view block (camera, fog). */
  beginFrame(camera: unknown, scene: unknown): void;
  /** `version`: world matrix version of the candidate (SPEC-0682); -1 = unknown, compare the matrix. */
  take(object: Object3D, material: unknown, geometry: unknown, version?: number): NativeEntry | null;
  /** Once per list, before its `recipeFor` calls (SPEC-0685): reads the target formats once. Optional. */
  beginList?(renderContext: unknown): void;
  /** Recipe id of one pass for the render context's target formats; -1 = the three draws it at its place. */
  recipeFor(entry: NativeEntry, renderContext: unknown, pass?: number): number;
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

/** The fields of a three render item that `painterSortStable` compares. */
export interface SortKeyLike {
  groupOrder: number;
  renderOrder: number;
  z: number;
  id: number;
}

/**
 * A server entry (group order 0) sorts before `next`? An opaque entry is below every
 * transparent item and a transparent one below no opaque item; inside a list, the key of
 * `painterSortStable` (opaque) or `reversePainterSortStable` (transparent: `z` descending).
 */
export function keyBelow(
  renderOrder: number, z: number, id: number, transparent: boolean, next: SortKeyLike, nextTransparent: boolean,
): boolean {
  if (transparent !== nextTransparent) return !transparent;
  if (next.groupOrder !== 0) return next.groupOrder > 0;
  if (renderOrder !== next.renderOrder) return renderOrder < next.renderOrder;
  if (z !== next.z) return transparent ? z > next.z : z < next.z;
  return id < next.id;
}

/** The current handles of the shared groups (camera, lights) of the recipe. */
export function sharedHandles(backend: { get(o: unknown): Record<string, unknown> }, ro: ServerRoLike, recipe: ServerRecipe): unknown[] {
  const bindings = ro.getBindings();
  const out: unknown[] = [];
  for (let k = 0; k < recipe.compartilhados.length; k++) out.push(backend.get(bindings[recipe.compartilhados[k]!])['group']);
  return out;
}

/** The recipe was recorded with the shared groups the three has now? */
export function sameShared(recipe: ServerRecipe, handles: unknown[]): boolean {
  const idx = recipe.compartilhados;
  if (idx.length !== handles.length) return false;
  for (let k = 0; k < idx.length; k++) if (recipe.grupos[idx[k]!] !== handles[k]) return false;
  return true;
}
