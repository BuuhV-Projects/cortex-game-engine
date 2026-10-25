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
import { recordNativePipelineBirth } from '../../core/PipelineBirthLog.js';
import type { DrawBatchBridge } from '../DrawBatch.js';
import type { NativeDrawer, NativeEntry } from '../RenderServer.js';
import { queryFlagRequested } from '../TransformOnlyRefresh.js';
import { classifyDrawable } from './RendererClassifier.js';
import { GAME_MATERIAL_PREFIX, gameMaterialModel } from './GameMaterials.js';
import { shaderTime } from './ShaderClock.js';
import { NATIVE_MODELS } from './models/index.js';
import { FRAME_BLOCKS } from './frame/index.js';
import type { FrameBlock, FrameBlockFactory } from './frame/FrameBlock.js';
import {
  INSTANCE_MATRIX_COLUMNS, OBJECT_FLOATS, OBJECT_NORMAL_AT, VIEW_FLOATS, VIEW_TIME_AT, coreWgsl, type NativeModelDef,
} from './models/NativeModel.js';

const QUERY_KEY = 'nativeRenderer=';
const MODELS_QUERY = 'nativeRendererModels=';
/** WebGPU default `minUniformBufferOffsetAlignment`: one object block per 256 bytes. */
const UNIFORM_ALIGN_BYTES = 256;
const OBJECT_SLOTS_PER_CHUNK = 256;
const FLOAT_BYTES = 4;
const MAT4_FLOATS = 16;
const TRIANGLE_VERTICES = 3;
const NO_RECIPE = -1;
/** `MatState.textureVersions` entry of a texture not bound yet: never equal to a `texture.version`. */
const NOT_READY = -1;
/** Projections between reports on `debug('perf')`, plus one early report for short rounds. */
const REPORT_FRAMES = 600;
const EARLY_REPORT_FRAME = 120;
/** Refusal reasons listed per report (most frequent first). */
const REPORT_REASONS = 8;
/** Decimals of the pipeline creation ms on `debug('perf')`. */
const MS_DIGITS = 2;
/**
 * `?nativeTint=1`: adds TINT_DELTA to the red of every material the native renderer draws, and
 * only there — the known-answer case of the same-run parity (SPEC-0495): it must FAIL.
 */
const TINT_QUERY = 'nativeTint=';
/** `?nativePrecompile=1`: warm-up through the native renderer (SPEC-0585), off until accepted. */
const PRECOMPILE_QUERY = 'nativePrecompile=';
const TINT_DELTA = 8 / 255;
/** three constants (kept local). */
const FRONT_SIDE = 0;
const BACK_SIDE = 1;
const DOUBLE_SIDE = 2;
const NORMAL_BLENDING = 1;
const ADDITIVE_BLENDING = 2;
const LESS_EQUAL_DEPTH = 3;
const NO_TONE_MAPPING = 0;
/** `instanceMatrix`: 16 floats per instance, read as 4 vec4 columns (SPEC-0555). */
const MAT4_COLUMN_BYTES = 16;
/** Without `scene.fog`, near/far this large make `smoothstep` return 0: no fog. */
const NO_FOG_NEAR = 1e37;
const NO_FOG_FAR = 2e37;
/** Refusals worth retrying next frame (the texture is still loading). */
const RETRY_REASONS = new Set(['texture']);
/**
 * Object/pipeline features: the core's, not the models' (see `models/NativeModel.ts`). Removed
 * from the classification before the model sees it; refused unless supported below.
 */
export const CORE_FEATURES = new Set(['instanced', 'skinned', 'transparent', 'additive', 'noDepthWrite', 'polygonOffset', 'renderOrder', 'doubleSide']);
/** What the core draws today (R1.4, SPEC-0555: instancing, transparency, state). R1.5 adds skinning. */
const CORE_SUPPORTED = new Set(['doubleSide', 'instanced', 'transparent', 'additive', 'noDepthWrite', 'polygonOffset', 'renderOrder', 'skinned']);
/** Vertex semantics every model may read without declaring their type (`attributeTypes` is for the rest). */
const BUILTIN_SEMANTICS = new Set<string>(['position', 'normal', 'uv', 'color', 'instanceColor']);
/** Skin attributes the core appends after the model's (`coreWgsl` with `skinned`). */
const SKIN_SEMANTICS = ['skinIndex', 'skinWeight'];
/** Skin storage: bindMatrix + bindMatrixInverse, then the bone matrices (SPEC-0565). */
const SKIN_HEADER_FLOATS = 2 * 16;
/** three `FloatType`: not filterable (RGBA32F), read with `textureLoad` (a DataTexture of instance data). */
const FLOAT_TYPE = 1015;
const UNFILTERABLE = 'u';
const FILTERABLE = 'f';
/** Vertex semantics read from the object, not the geometry. */
const OBJECT_SEMANTICS = new Set<string>(['instanceColor']);
/**
 * Blend states of the three's `_getBlending` (not premultiplied). Normal blending only when the
 * material is transparent (the three draws an opaque normal material without blending).
 */
const BLEND_STATES = {
  normal: {
    color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  },
  additive: {
    color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' },
    alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
  },
} as const;
type Blend = 'none' | keyof typeof BLEND_STATES;
const MAT3_COLUMNS = 3;
const ROW_FLOATS = 4;

const BUFFER_UNIFORM = 0x40;
const BUFFER_COPY_DST = 0x08;
const BUFFER_VERTEX = 0x20;
const BUFFER_INDEX = 0x10;
const BUFFER_STORAGE = 0x80;
const STAGE_VERTEX = 0x1;
const STAGE_FRAGMENT = 0x2;

export function nativeRendererRequested(fallback = false): boolean {
  return queryFlagRequested(QUERY_KEY, fallback);
}

/** `?nativeRendererModels=unlit,lambert` → the models allowed; absent = all. */
export function nativeRendererModels(search: string = typeof location !== 'undefined' ? location.search : ''): Set<string> | null {
  const at = search.indexOf(MODELS_QUERY);
  if (at < 0) return null;
  const rest = search.slice(at + MODELS_QUERY.length);
  const end = rest.indexOf('&');
  return new Set((end < 0 ? rest : rest.slice(0, end)).split(',').filter(Boolean));
}

// ── Minimal shapes of the WebGPU shim and of the three internals used here ─────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
type Gpu = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface NativeRendererHost {
  backend: {
    device: Gpu;
    get(o: unknown): Record<string, unknown>;
    utils: {
      getCurrentColorFormat(ctx: unknown): string;
      getCurrentDepthStencilFormat(ctx: unknown): string;
      getSampleCountRenderContext(ctx: unknown): number;
    };
  };
  _textures: { updateTexture(t: unknown): void; updateSampler(t: unknown): unknown };
  toneMapping?: number;
}

interface AttributeLike {
  array: ArrayBufferView & ArrayLike<number>;
  itemSize: number;
  normalized: boolean;
  version: number;
  count: number;
  isInterleavedBufferAttribute?: boolean;
  isInstancedBufferAttribute?: boolean;
  offset?: number;
  data?: { array: ArrayBufferView & ArrayLike<number>; stride: number; version: number; isInstancedInterleavedBuffer?: boolean };
}
interface GeometryLike {
  attributes: Record<string, AttributeLike | undefined>;
  index: AttributeLike | null;
  groups: unknown[];
  drawRange: { start: number; count: number };
  morphAttributes: Record<string, unknown[]>;
}

/** WebGPU vertex format of a three attribute, or `null` = not representable. */
export function vertexFormat(array: ArrayLike<number>, itemSize: number, normalized: boolean): string | null {
  if (array instanceof Float32Array) return itemSize >= 1 && itemSize <= 4 ? (itemSize === 1 ? 'float32' : `float32x${itemSize}`) : null;
  const even = itemSize === 2 || itemSize === 4;
  if (array instanceof Uint16Array && normalized && even) return `unorm16x${itemSize}`;
  if (array instanceof Int16Array && normalized && even) return `snorm16x${itemSize}`;
  if (array instanceof Uint8Array && normalized && itemSize === 4) return 'unorm8x4';
  // skinIndex (glTF JOINTS_0): integer, read as vec4<u32>.
  if (array instanceof Uint16Array && !normalized && itemSize === 4) return 'uint16x4';
  if (array instanceof Uint8Array && !normalized && itemSize === 4) return 'uint8x4';
  // The three widens non-normalized 8/16-bit integers to 32 bits in place when it uploads them.
  if (array instanceof Uint32Array && !normalized && itemSize >= 1 && itemSize <= 4) return itemSize === 1 ? 'uint32' : `uint32x${itemSize}`;
  if (array instanceof Int8Array && normalized && itemSize === 4) return 'snorm8x4';
  return null;
}

/** Vertex buffers of a geometry or of an object's instance attributes, kept in sync by version. */
interface VertexSet {
  /** One GPU buffer per source array (interleaved attributes share one). */
  buffers: Gpu[];
  /** `src` = the attribute (or its interleaved buffer); `array` = what was uploaded. */
  sources: Array<{ src: { array: ArrayBufferView; version: number }; array: ArrayBufferView; seen: number }>;
  layouts: Array<{ arrayStride: number; stepMode: 'vertex' | 'instance'; attributes: Array<{ shaderLocation: number; offset: number; format: string }> }>;
  key: string;
}

interface GeoState extends VertexSet {
  index: Gpu | null;
  index32: boolean;
  indexSource: AttributeLike | null;
  indexSeen: number;
  /** A source array was replaced: the next instance built on this geometry uploads it again. */
  stale: boolean;
}

/** Pipeline state of an instance (SPEC-0555): blend, depth write, depth bias, cull per pass. */
interface DrawState {
  blend: Blend;
  depthWrite: boolean;
  /** `[polygonOffsetUnits, polygonOffsetFactor]`, or `null` without `polygonOffset`. */
  bias: [number, number] | null;
  /** Cull mode of each pass, in draw order (transparent DoubleSide: back faces first). */
  culls: string[];
  key: string;
}

interface MatState {
  model: NativeModelDef;
  variant: string[];
  version: number;
  params: Float32Array;
  scratch: Float32Array;
  buffer: Gpu;
  textures: unknown[];
  /** One char per texture: `f` filterable, `u` unfilterable float (the group-2 layout key). */
  kinds: string;
  gpuTextures: unknown[];
  /** `texture.version` at the last check (`NOT_READY` = check again next frame). */
  textureVersions: number[];
  group: Gpu | null;
  frame: number;
  /** Bumped when the group or pipeline changes: recipes recorded before are stale. */
  generation: number;
}

interface Inst extends NativeEntry {
  object: Object3D;
  material: Material;
  geometry: GeometryLike;
  /** `material.version` and `instanceColor` at build: a change rebuilds (the classification may change). */
  version: number;
  instanceColor: unknown;
  mat: MatState;
  geo: GeoState;
  /** Per-object instance buffers (`instanceMatrix`, `instanceColor`), or `null`. */
  extra: VertexSet | null;
  /** SkinnedMesh: its skin storage (bind, bindInverse, bones) and the CPU copy written per frame. */
  skin: { buffer: Gpu; data: Float32Array } | null;
  vertexBuffers: Gpu[];
  instanced: boolean;
  state: DrawState;
  slot: number;
  chunk: Gpu;
  group: Gpu;
  last: Float32Array;
  recipes: Map<string, { id: number; generation: number; frame: number }>;
  // Per frame (`getDrawParameters` of the three): drawRange, InstancedMesh.count.
  count: number;
  first: number;
  triangles: number;
  instances: number;
  passes: number;
  transparent: boolean;
}

/** Refused (object, material, geometry): checked again only when one of them changes. */
interface Refusal {
  material: unknown;
  geometry: unknown;
  version: number;
  instanceColor: unknown;
  reason: string;
}

export interface NativeRendererStats {
  taken: number;
  refused: number;
  moved: number;
  paramWrites: number;
  pipelines: number;
  /** Creation time of all pipelines (shader module + pipeline), ms (SPEC-0585). */
  pipelineMs: number;
  recipes: number;
}

export class NativeRenderer implements NativeDrawer {
  readonly stats: NativeRendererStats = { taken: 0, refused: 0, moved: 0, paramWrites: 0, pipelines: 0, pipelineMs: 0, recipes: 0 };
  private readonly _device: Gpu;
  private readonly _models = new Map<string, NativeModelDef>();
  private readonly _byObject = new WeakMap<Object3D, Inst | Refusal>();
  private readonly _mats = new WeakMap<Material, MatState>();
  private readonly _geos = new WeakMap<object, GeoState>();
  private readonly _pipelines = new Map<string, Gpu>();
  private readonly _modules = new Map<string, Gpu>();
  private readonly _viewData = new Float32Array(VIEW_FLOATS);
  private readonly _viewBuffer: Gpu;
  private readonly _viewGroup: Gpu;
  private readonly _blocks: FrameBlock[];
  private readonly _frameWgsl: string;
  private _frameGroup: Gpu = null;
  private _frameVersions = '';
  /** Bumped when group 1 is rebuilt: recipes recorded with the old group are stale. */
  private _frameGeneration = 0;
  private readonly _normal = new Matrix3();
  private readonly _layouts: { view: Gpu; frame: Gpu; object: Gpu; objectSkinned: Gpu; material: Map<string, Gpu> };
  private readonly _allowed: Set<string> | null;
  /** Frame of the last `skeleton.update()` per skeleton (a skeleton shared by meshes updates once). */
  private readonly _skeletonFrames = new WeakMap<object, number>();
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
  private readonly _tint = queryFlagRequested(TINT_QUERY, false);
  /** Frames begun so far (the warm-up and `precompile` logs say where they fall). */
  get frame(): number {
    return this._frame;
  }
  /** Render context of the last main pass: `precompile` runs after the warm-up frame, outside it. */
  private _context: unknown = null;

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
    this._frameWgsl = this._blocks.map((b) => b.wgsl).join('\n');
    const view = d.createBindGroupLayout({ label: 'native.view', entries: [uniformEntry(0)] });
    const frame = d.createBindGroupLayout({ label: 'native.frame', entries: this._blocks.flatMap((b) => b.layoutEntries()) });
    const object = d.createBindGroupLayout({ label: 'native.object', entries: [uniformEntry(0)] });
    const objectSkinned = d.createBindGroupLayout({
      label: 'native.objectSkinned',
      entries: [uniformEntry(0), { binding: 1, visibility: STAGE_VERTEX, buffer: { type: 'read-only-storage' } }],
    });
    this._layouts = { view, frame, object, objectSkinned, material: new Map() };
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

  take(object: Object3D, material: unknown, geometry: unknown): NativeEntry | null {
    const cached = this._byObject.get(object);
    const version = (material as Material).version;
    const instanceColor = (object as { instanceColor?: unknown }).instanceColor ?? null;
    if (
      cached !== undefined && cached.material === material && cached.geometry === geometry &&
      cached.version === version && cached.instanceColor === instanceColor
    ) {
      if (!('mat' in cached)) return null;
      if (this._refreshInstance(cached)) {
        this.stats.taken++;
        return cached;
      }
    }
    if (cached !== undefined && 'mat' in cached) this._dropInstance(cached);
    const inst = this._build(object, material as Material, geometry as GeometryLike);
    if (inst === null) return null;
    this.stats.taken++;
    return inst;
  }

  recipeFor(entry: NativeEntry, renderContext: unknown, pass = 0): number {
    const inst = entry as Inst;
    this._context = renderContext;
    const u = this._host.backend.utils;
    const color = u.getCurrentColorFormat(renderContext);
    const depth = u.getCurrentDepthStencilFormat(renderContext);
    const samples = u.getSampleCountRenderContext(renderContext);
    const target = `${color}|${depth}|${samples}|${pass}`;
    const known = inst.recipes.get(target);
    if (known && known.generation === inst.mat.generation && known.frame === this._frameGeneration) return known.id;
    if (known) this._bridge.release(known.id);
    const pipeline = this._pipeline(inst, color, depth, samples, target, inst.state.culls[pass]!);
    if (!pipeline || !inst.mat.group) return NO_RECIPE;
    const id = this._bridge.record(pipeline, [this._viewGroup, this._frameGroup, inst.mat.group, inst.group], inst.vertexBuffers, inst.geo.index, inst.geo.index32);
    if (id === NO_RECIPE) return NO_RECIPE;
    inst.recipes.set(target, { id, generation: inst.mat.generation, frame: this._frameGeneration });
    this.stats.recipes++;
    return id;
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
    this.stats.refused++;
    return null;
  }

  private _build(object: Object3D, material: Material, geometry: GeometryLike): Inst | null {
    const c = classifyDrawable(object, material);
    if (c.kind !== 'covered') return this._refuse(object, material, geometry, c.kind === 'skip' ? 'skip' : c.reason);
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
    const mat = this._material(material, model, variant);
    if (mat === null) return this._refuse(object, material, geometry, 'texture');
    const semantics = model.attributes(variant);
    for (const sem of semantics) {
      if (!BUILTIN_SEMANTICS.has(sem) && !model.attributeTypes?.[sem]) return this._refuse(object, material, geometry, `attribute:${sem}:type`);
    }
    const skinned = c.features.includes('skinned');
    if (skinned && c.features.includes('instanced')) return this._refuse(object, material, geometry, 'core:skinnedInstanced');
    const geo = this._geometry(geometry, skinned ? [...semantics, ...SKIN_SEMANTICS] : semantics);
    if (typeof geo === 'string') return this._refuse(object, material, geometry, geo);
    const instanced = c.features.includes('instanced');
    const extra = instanced || semantics.some((s) => OBJECT_SEMANTICS.has(s)) ? this._instanceSet(object, semantics, instanced) : null;
    if (typeof extra === 'string') return this._refuse(object, material, geometry, extra);
    const state = drawState(m, opaque);
    const slot = this._allocSlot();
    const chunk = this._chunks[Math.floor(slot / OBJECT_SLOTS_PER_CHUNK)];
    const offset = (slot % OBJECT_SLOTS_PER_CHUNK) * UNIFORM_ALIGN_BYTES;
    const skin = skinned ? this._skinBuffer(object) : null;
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
      recipes: new Map(),
      count: 0,
      first: 0,
      triangles: 0,
      instances: 1,
      passes: state.culls.length,
      transparent: m.transparent === true,
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

  /**
   * Per-object vertex buffers: `instanceColor` at its semantic's location, then the 4 columns of
   * `instanceMatrix` after the model's attributes (`coreWgsl` with `instanced`). A string = refusal.
   */
  private _instanceSet(object: Object3D, semantics: readonly string[], instanced: boolean): VertexSet | string {
    const o = object as Object3D & { instanceMatrix?: AttributeLike; instanceColor?: AttributeLike | null };
    const set: VertexSet = { buffers: [], sources: [], layouts: [], key: '' };
    const add = (attr: AttributeLike, attributes: VertexSet['layouts'][number]['attributes']): void => {
      set.buffers.push(this._uploadBuffer(attr.array, BUFFER_VERTEX));
      set.sources.push({ src: attr, array: attr.array, seen: attr.version });
      set.layouts.push({ arrayStride: attr.itemSize * FLOAT_BYTES, stepMode: 'instance', attributes });
    };
    const colorAt = semantics.indexOf('instanceColor');
    if (colorAt >= 0) {
      const ic = o.instanceColor;
      if (!ic || vertexFormat(ic.array, ic.itemSize, ic.normalized) !== 'float32x3') return 'attribute:instanceColor';
      add(ic, [{ shaderLocation: colorAt, offset: 0, format: 'float32x3' }]);
    }
    if (instanced) {
      const im = o.instanceMatrix;
      if (!im || !(im.array instanceof Float32Array) || im.itemSize !== MAT4_FLOATS) return 'attribute:instanceMatrix';
      const columns = [];
      for (let col = 0; col < INSTANCE_MATRIX_COLUMNS; col++) {
        columns.push({ shaderLocation: semantics.length + col, offset: col * MAT4_COLUMN_BYTES, format: 'float32x4' });
      }
      add(im, columns);
    }
    set.key = `${colorAt >= 0 ? 'c' : ''}${instanced ? 'm' : ''}`;
    return set;
  }

  /** A game WGSL material (`wgsl:<name>`, SPEC-0565) allowed by `?nativeRendererModels=`. */
  private _gameModel(name: string): NativeModelDef | undefined {
    const a = this._allowed;
    if (a && !a.has(name) && !(name.startsWith(GAME_MATERIAL_PREFIX) && a.has(GAME_MATERIAL_PREFIX.slice(0, -1)))) return undefined;
    return gameMaterialModel(name);
  }

  /** Skin storage of a SkinnedMesh: bindMatrix, bindMatrixInverse, then its skeleton's bones. */
  private _skinBuffer(object: Object3D): { buffer: Gpu; data: Float32Array } | null {
    const skeleton = (object as Object3D & { skeleton?: { boneMatrices: Float32Array | null; bones: unknown[] } }).skeleton;
    if (!skeleton || skeleton.bones.length === 0) return null;
    const data = new Float32Array(SKIN_HEADER_FLOATS + skeleton.bones.length * MAT4_FLOATS);
    const buffer = this._device.createBuffer({ label: 'native.skin', size: data.byteLength, usage: BUFFER_STORAGE | BUFFER_COPY_DST });
    return { buffer, data };
  }

  /** Per frame: `skeleton.update()` once per skeleton (like the three's SkinningNode), then the storage. */
  private _writeSkin(object: Object3D, skin: { buffer: Gpu; data: Float32Array }): void {
    const o = object as Object3D & {
      bindMatrix: { elements: ArrayLike<number> }; bindMatrixInverse: { elements: ArrayLike<number> };
      skeleton: { update(): void; boneMatrices: Float32Array };
    };
    if (this._skeletonFrames.get(o.skeleton) !== this._frame) {
      this._skeletonFrames.set(o.skeleton, this._frame);
      o.skeleton.update();
    }
    const d = skin.data;
    for (let i = 0; i < MAT4_FLOATS; i++) {
      d[i] = o.bindMatrix.elements[i]!;
      d[MAT4_FLOATS + i] = o.bindMatrixInverse.elements[i]!;
    }
    d.set(o.skeleton.boneMatrices.subarray(0, d.length - SKIN_HEADER_FLOATS), SKIN_HEADER_FLOATS);
    this._device.queue.writeBuffer(skin.buffer, 0, d);
  }

  private _dropInstance(inst: Inst): void {
    for (const r of inst.recipes.values()) this._bridge.release(r.id);
    inst.recipes.clear();
    this._freeSlots.push(inst.slot);
  }

  /**
   * Per frame: material snapshot (once per material), buffer versions, draw range and instance
   * count, matrix. `false` = a source array was replaced: the instance has to be rebuilt.
   */
  private _refreshInstance(inst: Inst): boolean {
    const mat = inst.mat;
    if (mat.frame !== this._frame) {
      mat.frame = this._frame;
      this._refreshMaterial(inst.material, mat);
    }
    if (!this._refreshGeometry(inst.geometry, inst.geo) || (inst.extra !== null && !this._refreshSet(inst.extra))) return false;
    this._drawParameters(inst);
    if (inst.skin) this._writeSkin(inst.object, inst.skin);
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

  // ── Materials ──────────────────────────────────────────────────────────────────────

  private _material(material: Material, model: NativeModelDef, variant: string[]): MatState | null {
    const known = this._mats.get(material);
    if (known && known.model === model && known.variant.join() === variant.join()) return known;
    const mat: MatState = {
      model, variant, version: material.version,
      params: new Float32Array(model.paramFloats),
      scratch: new Float32Array(model.paramFloats),
      buffer: this._device.createBuffer({ label: `native.${model.name}`, size: model.paramFloats * FLOAT_BYTES, usage: BUFFER_UNIFORM | BUFFER_COPY_DST }),
      textures: [...model.textures(material, variant)],
      kinds: '',
      gpuTextures: [],
      textureVersions: [],
      group: null,
      frame: -1,
      generation: known ? known.generation + 1 : 0,
    };
    this._writeParams(material, mat, mat.params);
    this._device.queue.writeBuffer(mat.buffer, 0, mat.params);
    if (!this._bindMaterial(mat)) return null;
    this._mats.set(material, mat);
    return mat;
  }

  private _refreshMaterial(material: Material, mat: MatState): void {
    if (material.version !== mat.version) {
      // needsUpdate: textures or code may have changed; rebuild the group, keep the variant check
      // for the next take (a changed classification refuses through `_build`).
      mat.version = material.version;
      mat.textures = [...mat.model.textures(material, mat.variant)];
      this._bindMaterial(mat);
    } else {
      // Like the three's bindings, only a moved `texture.version` reaches the upload (updateSampler
      // builds a string key per call). A render target's GPU texture is recreated on resize without a
      // version bump, so it is checked every frame (SPEC-0585 1a).
      for (let i = 0; i < mat.textures.length; i++) {
        const tex = mat.textures[i] as { version: number; isRenderTargetTexture?: boolean };
        if (tex.version === mat.textureVersions[i] && !tex.isRenderTargetTexture) continue;
        if (this._gpuTexture(tex) !== mat.gpuTextures[i]) {
          this._bindMaterial(mat);
          break;
        }
        mat.textureVersions[i] = tex.version;
      }
    }
    this._writeParams(material, mat, mat.scratch);
    const a = mat.params;
    const b = mat.scratch;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        a.set(b);
        this._device.queue.writeBuffer(mat.buffer, 0, a);
        this.stats.paramWrites++;
        return;
      }
    }
  }

  /** Model params, plus the known-answer tint (every model starts its block with the color). */
  private _writeParams(material: Material, mat: MatState, out: Float32Array): void {
    mat.model.writeParams(material, out);
    if (this._tint) out[0] = out[0]! + TINT_DELTA;
  }

  /** The three's uploaded GPU texture (uploading it if needed); `null` = not ready. */
  private _gpuTexture(texture: unknown): unknown {
    this._host._textures.updateTexture(texture);
    this._host._textures.updateSampler(texture);
    return this._host.backend.get(texture)['texture'] ?? null;
  }

  private _bindMaterial(mat: MatState): boolean {
    const entries: unknown[] = [{ binding: 0, resource: { buffer: mat.buffer } }];
    mat.gpuTextures = [];
    mat.textureVersions = mat.textures.map(() => NOT_READY);
    for (let i = 0; i < mat.textures.length; i++) {
      const tex = mat.textures[i];
      const gpu = this._gpuTexture(tex) as { createView(): unknown } | null;
      const sampler = this._host.backend.get(tex)['sampler'];
      if (!gpu || !sampler) return false;
      mat.gpuTextures.push(gpu);
      mat.textureVersions[i] = (tex as { version: number }).version;
      entries.push({ binding: 1 + 2 * i, resource: sampler }, { binding: 2 + 2 * i, resource: gpu.createView() });
    }
    mat.kinds = mat.textures.map((t) => ((t as { type?: number }).type === FLOAT_TYPE ? UNFILTERABLE : FILTERABLE)).join('');
    mat.group = this._device.createBindGroup({ layout: this._materialLayout(mat.kinds), entries });
    mat.generation++;
    return true;
  }

  /** Group-2 layout for these texture kinds (`f`/`u` per texture), visible in both stages. */
  private _materialLayout(kinds: string): Gpu {
    let layout = this._layouts.material.get(kinds);
    if (!layout) {
      const entries: unknown[] = [{ binding: 0, visibility: STAGE_VERTEX | STAGE_FRAGMENT, buffer: { type: 'uniform' } }];
      for (let i = 0; i < kinds.length; i++) {
        const unfilterable = kinds[i] === UNFILTERABLE;
        entries.push(
          { binding: 1 + 2 * i, visibility: STAGE_VERTEX | STAGE_FRAGMENT, sampler: { type: unfilterable ? 'non-filtering' : 'filtering' } },
          { binding: 2 + 2 * i, visibility: STAGE_VERTEX | STAGE_FRAGMENT, texture: { sampleType: unfilterable ? 'unfilterable-float' : 'float' } },
        );
      }
      layout = this._device.createBindGroupLayout({ label: `native.material.${kinds}`, entries });
      this._layouts.material.set(kinds, layout);
    }
    return layout;
  }

  // ── Geometry ───────────────────────────────────────────────────────────────────────

  /** Own GPU buffers for the attributes the variant reads; a string = refusal reason. */
  private _geometry(geometry: GeometryLike, semantics: readonly string[]): GeoState | string {
    const key = semantics.join();
    const known = this._geos.get(geometry);
    if (known && !known.stale && known.key.startsWith(key + '#')) return known;
    if (Object.values(geometry.morphAttributes).some((l) => l.length > 0)) return 'morph';
    const geo: GeoState = {
      buffers: [], sources: [], layouts: [], index: null, index32: false, indexSource: null, indexSeen: -1, key: '', stale: false,
    };
    const bySource = new Map<object, number>();
    const parts: string[] = [];
    for (let loc = 0; loc < semantics.length; loc++) {
      if (OBJECT_SEMANTICS.has(semantics[loc]!)) continue;
      const attr = geometry.attributes[semantics[loc]!];
      if (!attr) return `attribute:${semantics[loc]}`;
      const array = attr.isInterleavedBufferAttribute ? attr.data!.array : attr.array;
      const format = vertexFormat(array, attr.itemSize, attr.normalized);
      if (!format) return `format:${semantics[loc]}`;
      const bytes = (array as unknown as { BYTES_PER_ELEMENT: number }).BYTES_PER_ELEMENT;
      const stride = attr.isInterleavedBufferAttribute ? attr.data!.stride * bytes : attr.itemSize * bytes;
      const offset = attr.isInterleavedBufferAttribute ? (attr.offset ?? 0) * bytes : 0;
      const source = attr.isInterleavedBufferAttribute ? attr.data! : attr;
      // InstancedBufferAttribute of the geometry (a game WGSL's per-instance data, SPEC-0565).
      const stepMode = (attr.isInterleavedBufferAttribute ? attr.data!.isInstancedInterleavedBuffer : attr.isInstancedBufferAttribute) ? 'instance' : 'vertex';
      let slot = bySource.get(source);
      if (slot === undefined) {
        slot = geo.buffers.length;
        bySource.set(source, slot);
        geo.buffers.push(this._uploadBuffer(array, BUFFER_VERTEX));
        geo.sources.push({ src: source, array, seen: source.version });
        geo.layouts.push({ arrayStride: stride, stepMode, attributes: [] });
      }
      geo.layouts[slot]!.attributes.push({ shaderLocation: loc, offset, format });
      parts.push(`${slot}:${stride}:${offset}:${format}:${stepMode}`);
    }
    if (geometry.index) {
      const idx = geometry.index;
      geo.index32 = !(idx.array instanceof Uint16Array);
      geo.index = this._uploadBuffer(idx.array, BUFFER_INDEX);
      geo.indexSource = idx;
      geo.indexSeen = idx.version;
    }
    geo.key = `${key}#${parts.join('|')}`;
    this._geos.set(geometry, geo);
    return geo;
  }

  /** Rewrites the buffers whose source version changed; `false` = a source array was replaced. */
  private _refreshSet(set: VertexSet): boolean {
    for (let i = 0; i < set.sources.length; i++) {
      const s = set.sources[i]!;
      if (s.src.array !== s.array) return false;
      const v = s.src.version;
      if (v !== s.seen) {
        s.seen = v;
        this._device.queue.writeBuffer(set.buffers[i], 0, s.array);
        this._syncThreeCopy(s.src, s.array);
      }
    }
    return true;
  }

  /**
   * Keeps the three's GPU copy of a source we rewrote coherent (SPEC-0555, "Céu de dia"): the three
   * does not re-upload an attribute it stopped drawing while we owned it, so an object that goes back
   * to the three (refusal, the parity arm) drew stale data. Only where the three already has a buffer.
   */
  private _syncThreeCopy(src: object, array: ArrayBufferView): void {
    const copy = this._host.backend.get(src)['buffer'];
    if (copy) this._device.queue.writeBuffer(copy, 0, array);
  }

  private _refreshGeometry(geometry: GeometryLike, geo: GeoState): boolean {
    const idx = geo.indexSource;
    if (!this._refreshSet(geo) || geometry.index !== idx) {
      geo.stale = true;
      return false;
    }
    if (idx && idx.version !== geo.indexSeen) {
      geo.indexSeen = idx.version;
      this._device.queue.writeBuffer(geo.index, 0, idx.array);
    }
    return true;
  }

  private _uploadBuffer(array: ArrayBufferView, usage: number): Gpu {
    // writeBuffer needs a 4-byte multiple; a uint16 index buffer with an odd count is padded.
    const size = Math.ceil(array.byteLength / FLOAT_BYTES) * FLOAT_BYTES;
    const buffer = this._device.createBuffer({ size, usage: usage | BUFFER_COPY_DST });
    if (size === array.byteLength) this._device.queue.writeBuffer(buffer, 0, array);
    else {
      const padded = new Uint8Array(size);
      padded.set(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
      this._device.queue.writeBuffer(buffer, 0, padded);
    }
    return buffer;
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
    root.traverse((object) => {
      const mesh = object as Object3D & { isMesh?: boolean; material?: Material | Material[]; geometry?: unknown };
      if (!mesh.isMesh || !mesh.material || Array.isArray(mesh.material) || !mesh.material.visible || !object.layers.test(layers)) return;
      const entry = this.take(object, mesh.material, mesh.geometry) as Inst | null;
      if (entry === null) return;
      for (let pass = 0; pass < entry.state.culls.length; pass++) this.recipeFor(entry, context, pass);
    });
  }

  private _pipeline(inst: Inst, color: string, depth: string, samples: number, target: string, cull: string): Gpu | null {
    const mat = inst.mat;
    const extraKey = inst.extra ? inst.extra.key : '';
    const key = `${mat.model.name}|${mat.variant.join('+')}|${inst.geo.key}|${extraKey}|${inst.state.key}|${cull}|${mat.kinds}|${target}`;
    let pipeline = this._pipelines.get(key);
    if (pipeline) return pipeline;
    const start = performance.now();
    const codeKey = `${mat.model.name}|${mat.variant.join('+')}${inst.instanced ? '|instanced' : ''}${inst.skin ? '|skinned' : ''}`;
    let module = this._modules.get(codeKey);
    if (!module) {
      const core = { instanced: inst.instanced, skinned: inst.skin !== null, attributeTypes: mat.model.attributeTypes };
      const code = coreWgsl(mat.model.attributes(mat.variant), this._frameWgsl, core) + mat.model.wgsl(mat.variant);
      module = this._device.createShaderModule({ label: `native.${codeKey}`, code });
      this._modules.set(codeKey, module);
    }
    const layout = this._device.createPipelineLayout({
      bindGroupLayouts: [
        this._layouts.view, this._layouts.frame, this._materialLayout(mat.kinds), inst.skin ? this._layouts.objectSkinned : this._layouts.object,
      ],
    });
    const s = inst.state;
    const depthStencil: Record<string, unknown> = { format: depth, depthWriteEnabled: s.depthWrite, depthCompare: 'less-equal' };
    if (s.bias) {
      depthStencil['depthBias'] = s.bias[0];
      depthStencil['depthBiasSlopeScale'] = s.bias[1];
      depthStencil['depthBiasClamp'] = 0;
    }
    pipeline = this._device.createRenderPipeline({
      label: `native.${codeKey}`,
      layout,
      vertex: { module, entryPoint: 'vs', buffers: inst.extra ? [...inst.geo.layouts, ...inst.extra.layouts] : inst.geo.layouts },
      fragment: { module, entryPoint: 'fs', targets: [s.blend === 'none' ? { format: color } : { format: color, blend: BLEND_STATES[s.blend] }] },
      primitive: { topology: 'triangle-list', cullMode: cull, frontFace: 'ccw' },
      depthStencil,
      multisample: { count: samples },
    });
    this._pipelines.set(key, pipeline);
    const ms = performance.now() - start;
    this.stats.pipelines++;
    this.stats.pipelineMs += ms;
    recordNativePipelineBirth(inst.object, inst.material, ms, key);
    debug('perf', `[nativeRenderer] pipeline born frame=${this._frame} ${key} ${ms.toFixed(MS_DIGITS)}ms`);
    return pipeline;
  }

  private _report(): void {
    const s = this.stats;
    const reasons = [...this._refusals.entries()].sort((a, b) => b[1] - a[1]).slice(0, REPORT_REASONS).map(([r, n]) => `${r}=${n}`).join(' ');
    debug('perf', `[nativeRenderer] taken=${s.taken} refused=${s.refused} moved=${s.moved} params=${s.paramWrites} pipelines=${s.pipelines} pipelineMs=${s.pipelineMs.toFixed(MS_DIGITS)} recipes=${s.recipes} | ${reasons}`);
  }
}

const CULL_OF_SIDE: Record<number, string> = { [FRONT_SIDE]: 'back', [BACK_SIDE]: 'front', [DOUBLE_SIDE]: 'none' };

/**
 * Pipeline state of a material, as the three's `WebGPUPipelineUtils` builds it (SPEC-0555): blend
 * only when not opaque, `depthWrite`, `polygonOffset` as depth bias; a transparent `DoubleSide`
 * material (without `forceSinglePass`) is drawn twice like `Renderer._renderObject` does: back
 * faces (cull `front`), then front faces (cull `back`).
 */
export function drawState(
  m: { blending: number; transparent: boolean; depthWrite: boolean; side: number; forceSinglePass?: boolean; polygonOffset: boolean; polygonOffsetUnits?: number; polygonOffsetFactor?: number },
  opaque: boolean,
): DrawState {
  const blend: Blend = opaque ? 'none' : m.blending === ADDITIVE_BLENDING ? 'additive' : 'normal';
  const bias: [number, number] | null = m.polygonOffset ? [m.polygonOffsetUnits ?? 0, m.polygonOffsetFactor ?? 0] : null;
  const culls = m.transparent && m.side === DOUBLE_SIDE && !m.forceSinglePass ? ['front', 'back'] : [CULL_OF_SIDE[m.side] ?? 'back'];
  return { blend, depthWrite: m.depthWrite, bias, culls, key: `${blend}|${m.depthWrite ? 'w' : '-'}|${bias ? bias.join(',') : ''}` };
}

/** Builds the native renderer on a three WebGPU renderer, or `null` with the reason logged. */
export function createNativeRenderer(renderer: unknown, bridge: DrawBatchBridge | undefined): NativeRenderer | null {
  const host = renderer as Partial<NativeRendererHost>;
  if (!bridge || !host.backend?.device || !host.backend.utils || !host._textures) {
    debug('perf', '[nativeRenderer] host sem device/utils/_textures ou sem __cortexDrawBatch: não instalado');
    return null;
  }
  debug('perf', '[nativeRenderer] instalado');
  return (active = new NativeRenderer(host as NativeRendererHost, bridge, NATIVE_MODELS, nativeRendererModels()));
}

let active: NativeRenderer | null = null;

/** `?nativePrecompile=1` (SPEC-0585). */
export function nativePrecompileRequested(): boolean {
  return queryFlagRequested(PRECOMPILE_QUERY, false);
}

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
