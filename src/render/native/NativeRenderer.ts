/**
 * The native renderer's server (R1.1, SPEC-0495, ADR-0465): owns the drawable instances it
 * takes from the three — geometry, material, pipeline and bind groups of its own, drawn by the
 * C++ batch (`__cortexDrawBatch`, `draw_batch.*`) from recipes recorded with OUR handles.
 *
 * - GPU objects are created through the host's WebGPU shim (the same calls the three makes),
 *   once per instance/material/variant; only their handles cross to C++ (the recipe).
 * - Textures and samplers reuse the three's upload (`_textures.updateTexture/updateSampler`):
 *   KTX2, canvas and mips already work there.
 * - Emission goes through the RenderingServer list (RS1, `RenderServer.ts`): native entries are
 *   sorted with the three's items by the `painterSortStable` key, so coplanar ties keep the
 *   three's order.
 * - Per frame and per taken instance, JS checks its matrix (writes the object block only if it
 *   moved) and, once per frame per material, the params snapshot (SPEC-0495 §4).
 *
 * Host only, off by default: `?nativeRenderer=1` (needs the RS1 on), `?nativeRendererModels=`
 * limits the models. Refusal is per object: the three keeps everything not taken.
 */
import { Matrix3, type Layers, type Material, type Object3D } from 'three';
import { debug } from '../../core/debug.js';
import { traceNativeRefusal } from '../../core/perfTrace/traceCounters.js';
import type { DrawBatchBridge } from '../DrawBatch.js';
import type { NativeDrawer, NativeEntry } from '../RenderServer.js';
import { NO_VERSION } from '../RenderServerTypes.js';
import { queryFlagRequested } from '../TransformOnlyRefresh.js';
import { classifyDrawable } from './RendererClassifier.js';
import { GAME_MATERIAL_PREFIX, gameMaterialModel } from './GameMaterials.js';
import { shaderTime } from './ShaderClock.js';
import { NATIVE_MODELS } from './models/index.js';
import { FRAME_BLOCKS, countCsmReceiver } from './frame/index.js';
import type { FrameBlock, FrameBlockFactory } from './frame/FrameBlock.js';
import { OBJECT_FLOATS, OBJECT_NORMAL_AT, VIEW_FLOATS, VIEW_TIME_AT, type NativeModelDef } from './models/NativeModel.js';
import { NativeGeometryStore } from './NativeGeometryStore.js';
import { NativeShadowSource } from './NativeShadowSource.js';
import { setActiveShadowSource } from '../ShadowGeometrySource.js';
import { NO_TARGET, RecipeTarget } from './NativeRecipeTarget.js';
import { NativeMaterialStore } from './NativeMaterialStore.js';
import { NativePipelineStore, type NativeLayouts } from './NativePipelineStore.js';
import {
  BUFFER_COPY_DST, BUFFER_UNIFORM, BUILTIN_SEMANTICS, CORE_FEATURES, CORE_SUPPORTED, DEPTH_ONLY_QUERY,
  EARLY_REPORT_FRAME, FLOAT_BYTES, LESS_EQUAL_DEPTH, MAT3_COLUMNS, MAT4_FLOATS, MS_DIGITS, NO_FOG_FAR, NO_FOG_NEAR,
  NO_RECIPE, NO_TONE_MAPPING, NORMAL_BLENDING, OBJECT_SEMANTICS, OBJECT_SLOTS_PER_CHUNK, REPORT_FRAMES, REPORT_REASONS,
  RETRY_REASONS, ROW_FLOATS, SKIN_SEMANTICS, STAGE_FRAGMENT, STAGE_VERTEX, TINT_QUERY,
  TRIANGLE_VERTICES, UNIFORM_ALIGN_BYTES, drawState, nativePrecompileRequested, nativeRendererModels,
  type GeometryLike, type Gpu, type Inst, type RecipeRecord, type NativeRendererHost, type NativeRendererStats, type Refusal,
} from './nativeRendererShared.js';

export {
  CORE_FEATURES, drawState, nativePrecompileRequested, nativeRendererModels, nativeRendererRequested, setNativeRendererDefault,
  vertexFormat, type NativeRendererHost, type NativeRendererStats,
} from './nativeRendererShared.js';

export class NativeRenderer implements NativeDrawer {
  readonly stats: NativeRendererStats = { taken: 0, refused: 0, moved: 0, paramWrites: 0, pipelines: 0, pipelineMs: 0, recipes: 0 };
  private readonly _device: Gpu;
  private readonly _models = new Map<string, NativeModelDef>();
  private readonly _byObject = new WeakMap<Object3D, Inst | Refusal>();
  private readonly _geometries: NativeGeometryStore;
  /** Geometry/UV source of the shadow pass over this renderer's buffers (ADR-0692). */
  readonly shadowSource: NativeShadowSource;
  private readonly _materials: NativeMaterialStore;
  private readonly _pipelines: NativePipelineStore;
  private readonly _viewData = new Float32Array(VIEW_FLOATS);
  private readonly _viewBuffer: Gpu;
  private readonly _viewGroup: Gpu;
  private readonly _blocks: FrameBlock[];
  private _frameGroup: Gpu = null;
  private _frameVersions = '';
  /** Bumped when group 1 is rebuilt: recipes recorded with the old group are stale. */
  private _frameGeneration = 0;
  private readonly _normal = new Matrix3();
  private readonly _layouts: NativeLayouts;
  private readonly _allowed: Set<string> | null;
  private readonly _chunks: Gpu[] = [];
  private readonly _freeSlots: number[] = [];
  private _slotCount = 0;
  private readonly _objectScratch = new Float32Array(OBJECT_FLOATS);
  private _frame = 0;
  /** `scene.fog` of the current frame: linear, none, or another kind (refused). */
  private _fog: 'linear' | 'none' | 'other' = 'none';
  private readonly _refusals = new Map<string, number>();
  /** Refusals of the warm-up while it runs (`null` outside it). */
  private _sweepRefusals: Map<string, number> | null = null;
  private readonly _depthOnly = queryFlagRequested(DEPTH_ONLY_QUERY, true);
  /** Frames begun so far (the warm-up and `precompile` logs say where they fall). */
  get frame(): number {
    return this._frame;
  }
  /** Render context of the last main pass: `precompile` runs after the warm-up frame, outside it. */
  private _context: unknown = null;
  /** Alvo da lista corrente (SPEC-0685). */
  private readonly _target = new RecipeTarget();

  constructor(
    private readonly _host: NativeRendererHost,
    private readonly _bridge: DrawBatchBridge,
    models: readonly NativeModelDef[],
    allowed: Set<string> | null,
    frameBlocks: readonly FrameBlockFactory[] = FRAME_BLOCKS,
  ) {
    this._allowed = allowed;
    for (const m of models) if (!allowed || allowed.has(m.name)) this._models.set(m.name, m);
    const d = (this._device = _host.backend.device);
    const uniformEntry = (binding: number) => ({ binding, visibility: STAGE_VERTEX | STAGE_FRAGMENT, buffer: { type: 'uniform' } });
    this._blocks = frameBlocks.map((create) => create(d, _host));
    const frameWgsl = this._blocks.map((b) => b.wgsl).join('\n');
    const view = d.createBindGroupLayout({ label: 'native.view', entries: [uniformEntry(0)] });
    const frame = d.createBindGroupLayout({ label: 'native.frame', entries: this._blocks.flatMap((b) => b.layoutEntries()) });
    const object = d.createBindGroupLayout({ label: 'native.object', entries: [uniformEntry(0)] });
    const objectSkinned = d.createBindGroupLayout({
      label: 'native.objectSkinned',
      entries: [uniformEntry(0), { binding: 1, visibility: STAGE_VERTEX, buffer: { type: 'read-only-storage' } }],
    });
    this._layouts = { view, frame, object, objectSkinned };
    this._geometries = new NativeGeometryStore(d, _host);
    this.shadowSource = new NativeShadowSource(this._geometries, _host);
    this._materials = new NativeMaterialStore(d, _host, this.stats, queryFlagRequested(TINT_QUERY, false));
    this._pipelines = new NativePipelineStore(d, this._layouts, frameWgsl, this._materials, this.stats);
    this._viewBuffer = d.createBuffer({ label: 'native.view', size: VIEW_FLOATS * FLOAT_BYTES, usage: BUFFER_UNIFORM | BUFFER_COPY_DST });
    this._viewGroup = d.createBindGroup({ layout: view, entries: [{ binding: 0, resource: { buffer: this._viewBuffer } }] });
    this._refreshFrameGroup();
  }

  /** Rebuilds group 1 when a frame block changed its GPU resources. */
  private _refreshFrameGroup(): void {
    const versions = this._blocks.map((b) => b.version).join();
    if (this._frameGroup !== null && versions === this._frameVersions) return;
    this._frameVersions = versions;
    this._frameGroup = this._device.createBindGroup({ layout: this._layouts.frame, entries: this._blocks.flatMap((b) => b.resources()) });
    this._frameGeneration++;
  }

  // ── NativeDrawer (called by the RenderingServer) ───────────────────────────────────

  beginFrame(camera: unknown, scene: unknown): void {
    this._frame++;
    this._target.reset();
    const c = camera as { projectionMatrix: { elements: ArrayLike<number> }; matrixWorldInverse: { elements: ArrayLike<number> } };
    const v = this._viewData;
    for (let i = 0; i < MAT4_FLOATS; i++) {
      v[i] = c.projectionMatrix.elements[i]!;
      v[MAT4_FLOATS + i] = c.matrixWorldInverse.elements[i]!;
    }
    const fog = (scene as { fog?: { isFog?: boolean; color: { r: number; g: number; b: number }; near: number; far: number } | null }).fog;
    const at = 2 * MAT4_FLOATS;
    this._fog = !fog ? 'none' : fog.isFog ? 'linear' : 'other';
    if (fog && fog.isFog) {
      v[at] = fog.color.r;
      v[at + 1] = fog.color.g;
      v[at + 2] = fog.color.b;
      v[at + 3] = fog.near;
      v[at + 4] = fog.far;
    } else {
      v[at + 3] = NO_FOG_NEAR;
      v[at + 4] = NO_FOG_FAR;
    }
    v[VIEW_TIME_AT] = shaderTime.value;
    this._device.queue.writeBuffer(this._viewBuffer, 0, v);
    for (let i = 0; i < this._blocks.length; i++) this._blocks[i]!.update(scene, camera);
    this._refreshFrameGroup();
    if (this._frame % REPORT_FRAMES === 0 || this._frame === EARLY_REPORT_FRAME) this._report();
  }

  /** `worldVersion`: the candidate's world matrix version from the projection (SPEC-0682); -1 = unknown. */
  take(object: Object3D, material: unknown, geometry: unknown, worldVersion = NO_VERSION): NativeEntry | null {
    const cached = this._byObject.get(object);
    const version = (material as Material).version;
    const instanceColor = (object as { instanceColor?: unknown }).instanceColor ?? null;
    if (
      cached !== undefined && cached.material === material && cached.geometry === geometry &&
      cached.version === version && cached.instanceColor === instanceColor
    ) {
      if (!('mat' in cached)) return null;
      if (this._refreshInstance(cached, worldVersion)) return this._taken(cached);
    }
    if (cached !== undefined && 'mat' in cached) this._dropInstance(cached);
    const inst = this._build(object, material as Material, geometry as GeometryLike);
    return inst === null ? null : this._taken(inst);
  }

  /** A draw handed to the list; a shadow receiver also counts for the CSM trace (SPEC-0690). */
  private _taken(inst: Inst): Inst {
    this.stats.taken++;
    if (inst.receivesShadow) countCsmReceiver();
    return inst;
  }

  /** Once per list (SPEC-0685): reads the target formats of the render context for every entry of it. */
  beginList(renderContext: unknown): void {
    this._context = renderContext;
    this._target.use(this._host.backend.utils, renderContext);
  }

  recipeFor(entry: NativeEntry, renderContext: unknown, pass = 0): number {
    const inst = entry as Inst;
    const t = this._target;
    if (renderContext !== t.context) this.beginList(renderContext);
    // Atalho (SPEC-0685): a receita do mesmo alvo e passe, ainda válida, sem string nem Map.get.
    const last = inst.passRecipe[pass];
    if (
      inst.passTarget[pass] === t.id && last !== undefined &&
      last.generation === inst.mat.generation && last.frame === this._frameGeneration
    ) return last.id;
    const target = t.key(pass);
    const known = inst.recipes.get(target);
    if (known && known.generation === inst.mat.generation && known.frame === this._frameGeneration) return this._remember(inst, pass, known);
    if (known) this._bridge.release(known.id);
    const pipeline = this._pipelines.pipeline(inst, t.color, t.depth, t.samples, target, inst.state.culls[pass]!, this._frame);
    if (!pipeline || !inst.mat.group) return NO_RECIPE;
    const id = this._bridge.record(pipeline, [this._viewGroup, this._frameGroup, inst.mat.group, inst.group], inst.vertexBuffers, inst.geo.index, inst.geo.index32);
    if (id === NO_RECIPE) return NO_RECIPE;
    const recipe = { id, generation: inst.mat.generation, frame: this._frameGeneration };
    inst.recipes.set(target, recipe);
    this.stats.recipes++;
    return this._remember(inst, pass, recipe);
  }

  /** Guarda a receita devolvida no atalho do passe (SPEC-0685). */
  private _remember(inst: Inst, pass: number, recipe: RecipeRecord): number {
    inst.passTarget[pass] = this._target.id;
    inst.passRecipe[pass] = recipe;
    return recipe.id;
  }

  // ── Instances ──────────────────────────────────────────────────────────────────────

  private _refuse(object: Object3D, material: unknown, geometry: unknown, reason: string): null {
    // Warm-up: counted apart and not cached, so a mesh offered later is classified (and counted) then.
    if (this._sweepRefusals !== null) {
      this._sweepRefusals.set(reason, (this._sweepRefusals.get(reason) ?? 0) + 1);
      return null;
    }
    if (!RETRY_REASONS.has(reason)) {
      const version = (material as Material).version;
      const instanceColor = (object as { instanceColor?: unknown }).instanceColor ?? null;
      this._byObject.set(object, { material, geometry, version, instanceColor, reason });
    }
    this._refusals.set(reason, (this._refusals.get(reason) ?? 0) + 1);
    traceNativeRefusal(reason); // SPEC-0688
    this.stats.refused++;
    return null;
  }

  private _build(object: Object3D, material: Material, geometry: GeometryLike): Inst | null {
    const c = classifyDrawable(object, material);
    if (c.kind !== 'covered') return this._refuse(object, material, geometry, c.kind === 'skip' ? 'skip' : c.reason);
    if (!this._depthOnly && c.features.includes('noColorWrite')) return this._refuse(object, material, geometry, 'skip');
    const model = this._models.get(c.model) ?? this._gameModel(c.model);
    if (!model) return this._refuse(object, material, geometry, `model:${c.model}`);
    for (const f of c.features) {
      if (CORE_FEATURES.has(f) && !CORE_SUPPORTED.has(f)) return this._refuse(object, material, geometry, `core:${f}`);
    }
    const m = material as Material & {
      depthFunc?: number; depthTest?: boolean; side?: number; premultipliedAlpha?: boolean; alphaToCoverage?: boolean;
      stencilWrite?: boolean; forceSinglePass?: boolean; polygonOffsetUnits?: number; polygonOffsetFactor?: number;
    };
    if (m.depthTest === false || (m.depthFunc ?? LESS_EQUAL_DEPTH) !== LESS_EQUAL_DEPTH) return this._refuse(object, material, geometry, 'depth');
    if (m.premultipliedAlpha) return this._refuse(object, material, geometry, 'core:premultipliedAlpha');
    if (m.alphaToCoverage) return this._refuse(object, material, geometry, 'core:alphaToCoverage');
    if (m.stencilWrite) return this._refuse(object, material, geometry, 'core:stencil');
    if ((this._host.toneMapping ?? NO_TONE_MAPPING) !== NO_TONE_MAPPING) return this._refuse(object, material, geometry, 'toneMapping');
    if (this._fog === 'other') return this._refuse(object, material, geometry, 'fog:exp2');
    if (object.matrixWorld.determinant() < 0) return this._refuse(object, material, geometry, 'mirrored');
    // The three's NodeBuilder.isOpaque(): otherwise the model outputs its real alpha (`alpha`).
    const opaque = !m.transparent && m.blending === NORMAL_BLENDING;
    const features = c.features.filter((f) => !CORE_FEATURES.has(f));
    if (!opaque) features.push('alpha');
    const variant = model.variant({ ...c, features: features.sort() }, object, material);
    if (variant === null) return this._refuse(object, material, geometry, `variant:${c.model}`);
    const mat = this._materials.material(material, model, variant);
    if (mat === null) return this._refuse(object, material, geometry, 'texture');
    const semantics = model.attributes(variant);
    for (const sem of semantics) {
      if (!BUILTIN_SEMANTICS.has(sem) && !model.attributeTypes?.[sem]) return this._refuse(object, material, geometry, `attribute:${sem}:type`);
    }
    const skinned = c.features.includes('skinned');
    if (skinned && c.features.includes('instanced')) return this._refuse(object, material, geometry, 'core:skinnedInstanced');
    const geo = this._geometries.geometry(geometry, skinned ? [...semantics, ...SKIN_SEMANTICS] : semantics);
    if (typeof geo === 'string') return this._refuse(object, material, geometry, geo);
    const instanced = c.features.includes('instanced');
    const extra = instanced || semantics.some((s) => OBJECT_SEMANTICS.has(s)) ? this._geometries.instanceSet(object, semantics, instanced) : null;
    if (typeof extra === 'string') return this._refuse(object, material, geometry, extra);
    const state = drawState(m, opaque);
    const slot = this._allocSlot();
    const chunk = this._chunks[Math.floor(slot / OBJECT_SLOTS_PER_CHUNK)];
    const offset = (slot % OBJECT_SLOTS_PER_CHUNK) * UNIFORM_ALIGN_BYTES;
    const skin = skinned ? this._geometries.skinBuffer(object) : null;
    if (skinned && skin === null) return this._refuse(object, material, geometry, 'skeleton');
    const objectEntry = { binding: 0, resource: { buffer: chunk, offset, size: OBJECT_FLOATS * FLOAT_BYTES } };
    const group = this._device.createBindGroup(skin
      ? { layout: this._layouts.objectSkinned, entries: [objectEntry, { binding: 1, resource: { buffer: skin.buffer } }] }
      : { layout: this._layouts.object, entries: [objectEntry] });
    const inst: Inst = {
      object, material, geometry, mat, geo, extra, instanced, skin, state, slot, chunk, group,
      version: material.version,
      instanceColor: (object as { instanceColor?: unknown }).instanceColor ?? null,
      vertexBuffers: extra ? [...geo.buffers, ...extra.buffers] : geo.buffers,
      last: new Float32Array(MAT4_FLOATS).fill(Number.NaN),
      worldVersion: NO_VERSION,
      recipes: new Map(),
      passTarget: new Int32Array(state.culls.length).fill(NO_TARGET),
      passRecipe: [],
      count: 0,
      first: 0,
      triangles: 0,
      instances: 1,
      passes: state.culls.length,
      transparent: m.transparent === true,
      receivesShadow: c.features.includes('receiveShadow'),
    };
    this._byObject.set(object, inst);
    object.addEventListener('removed', () => {
      if (this._byObject.get(object) === inst) {
        this._dropInstance(inst);
        this._byObject.delete(object);
      }
    });
    this._refreshInstance(inst);
    return inst;
  }

  /** A game WGSL material (`wgsl:<name>`, SPEC-0565) allowed by `?nativeRendererModels=`. */
  private _gameModel(name: string): NativeModelDef | undefined {
    const a = this._allowed;
    if (a && !a.has(name) && !(name.startsWith(GAME_MATERIAL_PREFIX) && a.has(GAME_MATERIAL_PREFIX.slice(0, -1)))) return undefined;
    return gameMaterialModel(name);
  }

  private _dropInstance(inst: Inst): void {
    for (const r of inst.recipes.values()) this._bridge.release(r.id);
    inst.recipes.clear();
    this._freeSlots.push(inst.slot);
  }

  /**
   * Per frame: material snapshot (once per material), buffer versions, draw range and instance
   * count, matrix (skipped when `worldVersion` is the one adopted: same matrix, SPEC-0682). `false` = a
   * source array was replaced: the instance has to be rebuilt.
   */
  private _refreshInstance(inst: Inst, worldVersion = NO_VERSION): boolean {
    const mat = inst.mat;
    if (mat.frame !== this._frame) {
      mat.frame = this._frame;
      this._materials.refreshMaterial(inst.material, mat);
    }
    if (!this._geometries.refreshGeometry(inst.geometry, inst.geo) || (inst.extra !== null && !this._geometries.refreshSet(inst.extra))) return false;
    this._drawParameters(inst);
    if (inst.skin) this._geometries.writeSkin(inst.object, inst.skin, this._frame);
    if (worldVersion > NO_VERSION && inst.worldVersion === worldVersion) return true;
    // The matrix read below is the one of this version (nothing writes it during the projection).
    inst.worldVersion = worldVersion;
    const e = inst.object.matrixWorld.elements;
    const last = inst.last;
    let moved = false;
    for (let i = 0; i < MAT4_FLOATS; i++) {
      if (Math.fround(e[i]!) !== last[i]) {
        moved = true;
        break;
      }
    }
    if (!moved) return true;
    for (let i = 0; i < MAT4_FLOATS; i++) last[i] = e[i]!;
    const o = this._objectScratch;
    o.set(last);
    // Normal matrix in double on the CPU, like the three's modelNormalMatrix.
    const n = this._normal.getNormalMatrix(inst.object.matrixWorld).elements;
    for (let col = 0; col < MAT3_COLUMNS; col++) {
      const at = OBJECT_NORMAL_AT + col * ROW_FLOATS;
      o[at] = n[col * MAT3_COLUMNS]!;
      o[at + 1] = n[col * MAT3_COLUMNS + 1]!;
      o[at + 2] = n[col * MAT3_COLUMNS + 2]!;
      o[at + 3] = 0;
    }
    this._device.queue.writeBuffer(inst.chunk, (inst.slot % OBJECT_SLOTS_PER_CHUNK) * UNIFORM_ALIGN_BYTES, this._objectScratch);
    this.stats.moved++;
    return true;
  }

  /** The three's `RenderObject.getDrawParameters`: drawRange clamped to the items; instances from the geometry's `instanceCount` or the object's `count`. */
  private _drawParameters(inst: Inst): void {
    const g = inst.geometry;
    const items = inst.geo.indexSource ? inst.geo.indexSource.count : g.attributes['position']!.count;
    const first = Math.max(g.drawRange.start, 0);
    const count = Math.max(Math.min(g.drawRange.start + g.drawRange.count, items) - first, 0);
    inst.first = first;
    inst.count = count;
    inst.triangles = count / TRIANGLE_VERTICES;
    const instancedGeometry = g as GeometryLike & { isInstancedBufferGeometry?: boolean; instanceCount?: number };
    const objectCount = (inst.object as Object3D & { count?: number }).count;
    // Non-finite instanceCount (the three's Infinity default) draws nothing (SPEC-0555).
    if (instancedGeometry.isInstancedBufferGeometry) inst.instances = Number.isFinite(instancedGeometry.instanceCount) ? instancedGeometry.instanceCount! : 0;
    else inst.instances = objectCount !== undefined ? Math.max(0, objectCount) : 1;
  }

  private _allocSlot(): number {
    const free = this._freeSlots.pop();
    if (free !== undefined) return free;
    const slot = this._slotCount++;
    if (slot % OBJECT_SLOTS_PER_CHUNK === 0) {
      this._chunks.push(
        this._device.createBuffer({ label: 'native.objects', size: OBJECT_SLOTS_PER_CHUNK * UNIFORM_ALIGN_BYTES, usage: BUFFER_UNIFORM | BUFFER_COPY_DST }),
      );
    }
    return slot;
  }


  // ── Pipelines ──────────────────────────────────────────────────────────────────────

  /**
   * Warm-up through the native renderer (SPEC-0585): builds the recipe of every eligible mesh under
   * `root`, in every pass, visible or not. The warm-up frame only reaches what the C++ projection
   * offers, which does not see the warm-up reveal (hidden pools, meshes out of view).
   *
   * @returns pipelines born; 0 before the first main pass (no render context yet).
   */
  precompile(root: Object3D, layers: Layers): number {
    const context = this._context;
    if (context === null) {
      debug('perf', '[nativeRenderer] precompile: no main pass yet');
      return 0;
    }
    const before = this.stats.pipelines;
    this._sweep(root, layers, context);
    return this.stats.pipelines - before;
  }

  /**
   * Runs the warm-up (frame + sweep) with its refusals counted apart and not cached: the warm-up
   * reveals hidden meshes, and a cached refusal would hide that mesh from the report when it is
   * offered for real later (SPEC-0585).
   */
  warmup<T>(run: () => T): T {
    const refusals = new Map<string, number>();
    this._sweepRefusals = refusals;
    try {
      return run();
    } finally {
      this._sweepRefusals = null;
      let refused = 0;
      refusals.forEach((n) => (refused += n));
      const reasons = [...refusals.entries()].map(([r, n]) => `${r}=${n}`).join(' ');
      debug('perf', `[nativeRenderer] warm-up refused=${refused} | ${reasons}`);
    }
  }

  private _sweep(root: Object3D, layers: Layers, context: unknown): void {
    this.beginList(context);
    root.traverse((object) => {
      const mesh = object as Object3D & { isMesh?: boolean; material?: Material | Material[]; geometry?: unknown };
      if (!mesh.isMesh || !mesh.material || Array.isArray(mesh.material) || !mesh.material.visible || !object.layers.test(layers)) return;
      const entry = this.take(object, mesh.material, mesh.geometry) as Inst | null;
      if (entry === null) return;
      for (let pass = 0; pass < entry.state.culls.length; pass++) this.recipeFor(entry, context, pass);
    });
  }

  private _report(): void {
    const s = this.stats;
    const reasons = [...this._refusals.entries()].sort((a, b) => b[1] - a[1]).slice(0, REPORT_REASONS).map(([r, n]) => `${r}=${n}`).join(' ');
    debug('perf', `[nativeRenderer] taken=${s.taken} refused=${s.refused} moved=${s.moved} params=${s.paramWrites} pipelines=${s.pipelines} pipelineMs=${s.pipelineMs.toFixed(MS_DIGITS)} recipes=${s.recipes} | ${reasons}`);
  }
}

/** Builds the native renderer on a three WebGPU renderer, or `null` with the reason logged. */
export function createNativeRenderer(renderer: unknown, bridge: DrawBatchBridge | undefined): NativeRenderer | null {
  const host = renderer as Partial<NativeRendererHost>;
  if (!bridge || !host.backend?.device || !host.backend.utils || !host._textures) {
    debug('perf', '[nativeRenderer] host sem device/utils/_textures ou sem __cortexDrawBatch: não instalado');
    return null;
  }
  debug('perf', '[nativeRenderer] instalado');
  active = new NativeRenderer(host as NativeRendererHost, bridge, NATIVE_MODELS, nativeRendererModels());
  setActiveShadowSource(active.shadowSource);
  return active;
}

let active: NativeRenderer | null = null;

/**
 * Called by `Game` for the warm-up frame (SPEC-0585): runs `draw` and, with `?nativePrecompile=1`,
 * {@link NativeRenderer.precompile} on the scene, both inside {@link NativeRenderer.warmup}. Without
 * the flag (or the native renderer), only `draw`.
 *
 * @returns native pipelines born by the sweep.
 */
export function precompileNative(root: Object3D, camera: { layers: Layers }, draw: () => void): number {
  if (active === null || !nativePrecompileRequested()) {
    draw();
    return 0;
  }
  const renderer = active;
  return renderer.warmup(() => {
    draw();
    const born = renderer.precompile(root, camera.layers);
    debug('perf', `[nativeRenderer] precompile frame=${renderer.frame} born=${born}`);
    return born;
  });
}
