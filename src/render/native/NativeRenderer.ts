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
import { Matrix3, type Material, type Object3D } from 'three';
import { debug } from '../../core/debug.js';
import type { DrawBatchBridge } from '../DrawBatch.js';
import type { NativeDrawer, NativeEntry } from '../RenderServer.js';
import { queryFlagRequested } from '../TransformOnlyRefresh.js';
import { classifyDrawable } from './RendererClassifier.js';
import { NATIVE_MODELS } from './models/index.js';
import { FRAME_BLOCKS } from './frame/index.js';
import type { FrameBlock, FrameBlockFactory } from './frame/FrameBlock.js';
import { OBJECT_FLOATS, OBJECT_NORMAL_AT, VIEW_FLOATS, coreWgsl, type NativeModelDef, type VertexSemantic } from './models/NativeModel.js';

const QUERY_KEY = 'nativeRenderer=';
const MODELS_QUERY = 'nativeRendererModels=';
/** WebGPU default `minUniformBufferOffsetAlignment`: one object block per 256 bytes. */
const UNIFORM_ALIGN_BYTES = 256;
const OBJECT_SLOTS_PER_CHUNK = 256;
const FLOAT_BYTES = 4;
const MAT4_FLOATS = 16;
const TRIANGLE_VERTICES = 3;
const NO_RECIPE = -1;
/** Projections between reports on `debug('perf')`, plus one early report for short rounds. */
const REPORT_FRAMES = 600;
const EARLY_REPORT_FRAME = 120;
/**
 * `?nativeTint=1`: adds TINT_DELTA to the red of every material the native renderer draws, and
 * only there — the known-answer case of the same-run parity (SPEC-0495): it must FAIL.
 */
const TINT_QUERY = 'nativeTint=';
const TINT_DELTA = 8 / 255;
/** three constants (kept local). */
const FRONT_SIDE = 0;
const BACK_SIDE = 1;
const LESS_EQUAL_DEPTH = 3;
const NO_TONE_MAPPING = 0;
/** Without `scene.fog`, near/far this large make `smoothstep` return 0: no fog. */
const NO_FOG_NEAR = 1e37;
const NO_FOG_FAR = 2e37;
/** Refusals worth retrying next frame (the texture is still loading). */
const RETRY_REASONS = new Set(['texture']);
/**
 * Object/pipeline features: the core's, not the models' (see `models/NativeModel.ts`). Removed
 * from the classification before the model sees it; refused unless supported below.
 */
const CORE_FEATURES = new Set(['instanced', 'skinned', 'transparent', 'additive', 'noDepthWrite', 'polygonOffset', 'renderOrder', 'doubleSide']);
/** What the core draws today. R1.4 adds instancing/transparency/state, R1.5 skinning. */
const CORE_SUPPORTED = new Set(['doubleSide']);
const MAT3_COLUMNS = 3;
const ROW_FLOATS = 4;

const BUFFER_UNIFORM = 0x40;
const BUFFER_COPY_DST = 0x08;
const BUFFER_VERTEX = 0x20;
const BUFFER_INDEX = 0x10;
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
  offset?: number;
  data?: { array: ArrayBufferView & ArrayLike<number>; stride: number; version: number };
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
  if (array instanceof Int8Array && normalized && itemSize === 4) return 'snorm8x4';
  return null;
}

interface GeoState {
  /** One GPU buffer per source array (interleaved attributes share one). */
  buffers: Gpu[];
  sources: Array<{ array: ArrayBufferView; version: () => number; seen: number }>;
  layouts: Array<{ arrayStride: number; attributes: Array<{ shaderLocation: number; offset: number; format: string }> }>;
  index: Gpu | null;
  index32: boolean;
  indexSource: AttributeLike | null;
  indexSeen: number;
  count: number;
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
  gpuTextures: unknown[];
  group: Gpu | null;
  frame: number;
  /** Bumped when the group or pipeline changes: recipes recorded before are stale. */
  generation: number;
}

interface Inst extends NativeEntry {
  object: Object3D;
  material: Material;
  geometry: GeometryLike;
  mat: MatState;
  geo: GeoState;
  slot: number;
  chunk: Gpu;
  group: Gpu;
  last: Float32Array;
  recipes: Map<string, { id: number; generation: number; frame: number }>;
  cull: string;
}

/** Refused (object, material, geometry): checked again only when one of them changes. */
interface Refusal {
  material: unknown;
  geometry: unknown;
  reason: string;
}

export interface NativeRendererStats {
  taken: number;
  refused: number;
  moved: number;
  paramWrites: number;
  pipelines: number;
  recipes: number;
}

export class NativeRenderer implements NativeDrawer {
  readonly stats: NativeRendererStats = { taken: 0, refused: 0, moved: 0, paramWrites: 0, pipelines: 0, recipes: 0 };
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
  private readonly _layouts: { view: Gpu; frame: Gpu; object: Gpu; material: Map<number, Gpu> };
  private readonly _chunks: Gpu[] = [];
  private readonly _freeSlots: number[] = [];
  private _slotCount = 0;
  private readonly _objectScratch = new Float32Array(OBJECT_FLOATS);
  private _frame = 0;
  /** `scene.fog` of the current frame: linear, none, or another kind (refused). */
  private _fog: 'linear' | 'none' | 'other' = 'none';
  private readonly _refusals = new Map<string, number>();
  private readonly _tint = queryFlagRequested(TINT_QUERY, false);

  constructor(
    private readonly _host: NativeRendererHost,
    private readonly _bridge: DrawBatchBridge,
    models: readonly NativeModelDef[],
    allowed: Set<string> | null,
    frameBlocks: readonly FrameBlockFactory[] = FRAME_BLOCKS,
  ) {
    for (const m of models) if (!allowed || allowed.has(m.name)) this._models.set(m.name, m);
    const d = (this._device = _host.backend.device);
    const uniformEntry = (binding: number) => ({ binding, visibility: STAGE_VERTEX | STAGE_FRAGMENT, buffer: { type: 'uniform' } });
    this._blocks = frameBlocks.map((create) => create(d));
    this._frameWgsl = this._blocks.map((b) => b.wgsl).join('\n');
    const view = d.createBindGroupLayout({ label: 'native.view', entries: [uniformEntry(0)] });
    const frame = d.createBindGroupLayout({ label: 'native.frame', entries: this._blocks.flatMap((b) => b.layoutEntries()) });
    const object = d.createBindGroupLayout({ label: 'native.object', entries: [uniformEntry(0)] });
    this._layouts = { view, frame, object, material: new Map() };
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
    this._device.queue.writeBuffer(this._viewBuffer, 0, v);
    for (let i = 0; i < this._blocks.length; i++) this._blocks[i]!.update(scene, camera);
    this._refreshFrameGroup();
    if (this._frame % REPORT_FRAMES === 0 || this._frame === EARLY_REPORT_FRAME) this._report();
  }

  take(object: Object3D, material: unknown, geometry: unknown): NativeEntry | null {
    const cached = this._byObject.get(object);
    if (cached !== undefined && cached.material === material && cached.geometry === geometry) {
      if (!('mat' in cached)) return null;
      this._refreshInstance(cached);
      this.stats.taken++;
      return cached;
    }
    if (cached !== undefined && 'mat' in cached) this._dropInstance(cached);
    const inst = this._build(object, material as Material, geometry as GeometryLike);
    if (inst === null) return null;
    this.stats.taken++;
    return inst;
  }

  recipeFor(entry: NativeEntry, renderContext: unknown): number {
    const inst = entry as Inst;
    const u = this._host.backend.utils;
    const color = u.getCurrentColorFormat(renderContext);
    const depth = u.getCurrentDepthStencilFormat(renderContext);
    const samples = u.getSampleCountRenderContext(renderContext);
    const target = `${color}|${depth}|${samples}`;
    const known = inst.recipes.get(target);
    if (known && known.generation === inst.mat.generation && known.frame === this._frameGeneration) return known.id;
    if (known) this._bridge.release(known.id);
    const pipeline = this._pipeline(inst, color, depth, samples, target);
    if (!pipeline || !inst.mat.group) return NO_RECIPE;
    const id = this._bridge.record(pipeline, [this._viewGroup, this._frameGroup, inst.mat.group, inst.group], inst.geo.buffers, inst.geo.index, inst.geo.index32);
    if (id === NO_RECIPE) return NO_RECIPE;
    inst.recipes.set(target, { id, generation: inst.mat.generation, frame: this._frameGeneration });
    this.stats.recipes++;
    return id;
  }

  // ── Instances ──────────────────────────────────────────────────────────────────────

  private _refuse(object: Object3D, material: unknown, geometry: unknown, reason: string): null {
    if (!RETRY_REASONS.has(reason)) this._byObject.set(object, { material, geometry, reason });
    this._refusals.set(reason, (this._refusals.get(reason) ?? 0) + 1);
    this.stats.refused++;
    return null;
  }

  private _build(object: Object3D, material: Material, geometry: GeometryLike): Inst | null {
    const c = classifyDrawable(object, material);
    if (c.kind !== 'covered') return this._refuse(object, material, geometry, c.kind === 'skip' ? 'skip' : c.reason);
    const model = this._models.get(c.model);
    if (!model) return this._refuse(object, material, geometry, `model:${c.model}`);
    for (const f of c.features) {
      if (CORE_FEATURES.has(f) && !CORE_SUPPORTED.has(f)) return this._refuse(object, material, geometry, `core:${f}`);
    }
    const shading = { ...c, features: c.features.filter((f) => !CORE_FEATURES.has(f)) };
    const m = material as Material & { depthFunc?: number; depthTest?: boolean; side?: number };
    if (m.depthTest === false || (m.depthFunc ?? LESS_EQUAL_DEPTH) !== LESS_EQUAL_DEPTH) return this._refuse(object, material, geometry, 'depth');
    if ((this._host.toneMapping ?? NO_TONE_MAPPING) !== NO_TONE_MAPPING) return this._refuse(object, material, geometry, 'toneMapping');
    if (this._fog === 'other') return this._refuse(object, material, geometry, 'fog:exp2');
    if (object.matrixWorld.determinant() < 0) return this._refuse(object, material, geometry, 'mirrored');
    const variant = model.variant(shading, object, material);
    if (variant === null) return this._refuse(object, material, geometry, `variant:${c.model}`);
    const mat = this._material(material, model, variant);
    if (mat === null) return this._refuse(object, material, geometry, 'texture');
    const geo = this._geometry(geometry, model.attributes(variant));
    if (typeof geo === 'string') return this._refuse(object, material, geometry, geo);
    const slot = this._allocSlot();
    const chunk = this._chunks[Math.floor(slot / OBJECT_SLOTS_PER_CHUNK)];
    const offset = (slot % OBJECT_SLOTS_PER_CHUNK) * UNIFORM_ALIGN_BYTES;
    const group = this._device.createBindGroup({
      layout: this._layouts.object,
      entries: [{ binding: 0, resource: { buffer: chunk, offset, size: OBJECT_FLOATS * FLOAT_BYTES } }],
    });
    const inst: Inst = {
      object, material, geometry, mat, geo, slot, chunk, group,
      last: new Float32Array(MAT4_FLOATS).fill(Number.NaN),
      recipes: new Map(),
      cull: m.side === FRONT_SIDE ? 'back' : m.side === BACK_SIDE ? 'front' : 'none',
      count: geo.count,
      first: 0,
      triangles: geo.count / TRIANGLE_VERTICES,
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

  private _dropInstance(inst: Inst): void {
    for (const r of inst.recipes.values()) this._bridge.release(r.id);
    inst.recipes.clear();
    this._freeSlots.push(inst.slot);
  }

  /** Per frame: material snapshot (once per material), geometry versions, matrix. */
  private _refreshInstance(inst: Inst): void {
    const mat = inst.mat;
    if (mat.frame !== this._frame) {
      mat.frame = this._frame;
      this._refreshMaterial(inst.material, mat);
    }
    this._refreshGeometry(inst.geo);
    const e = inst.object.matrixWorld.elements;
    const last = inst.last;
    let moved = false;
    for (let i = 0; i < MAT4_FLOATS; i++) {
      if (Math.fround(e[i]!) !== last[i]) {
        moved = true;
        break;
      }
    }
    if (!moved) return;
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
      gpuTextures: [],
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
      for (let i = 0; i < mat.textures.length; i++) {
        if (this._gpuTexture(mat.textures[i]) !== mat.gpuTextures[i]) {
          this._bindMaterial(mat);
          break;
        }
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
    for (let i = 0; i < mat.textures.length; i++) {
      const tex = mat.textures[i];
      const gpu = this._gpuTexture(tex) as { createView(): unknown } | null;
      const sampler = this._host.backend.get(tex)['sampler'];
      if (!gpu || !sampler) return false;
      mat.gpuTextures.push(gpu);
      entries.push({ binding: 1 + 2 * i, resource: sampler }, { binding: 2 + 2 * i, resource: gpu.createView() });
    }
    mat.group = this._device.createBindGroup({ layout: this._materialLayout(mat.textures.length), entries });
    mat.generation++;
    return true;
  }

  private _materialLayout(textures: number): Gpu {
    let layout = this._layouts.material.get(textures);
    if (!layout) {
      const entries: unknown[] = [{ binding: 0, visibility: STAGE_VERTEX | STAGE_FRAGMENT, buffer: { type: 'uniform' } }];
      for (let i = 0; i < textures; i++) {
        entries.push(
          { binding: 1 + 2 * i, visibility: STAGE_FRAGMENT, sampler: { type: 'filtering' } },
          { binding: 2 + 2 * i, visibility: STAGE_FRAGMENT, texture: { sampleType: 'float' } },
        );
      }
      layout = this._device.createBindGroupLayout({ label: `native.material${textures}`, entries });
      this._layouts.material.set(textures, layout);
    }
    return layout;
  }

  // ── Geometry ───────────────────────────────────────────────────────────────────────

  /** Own GPU buffers for the attributes the variant reads; a string = refusal reason. */
  private _geometry(geometry: GeometryLike, semantics: readonly VertexSemantic[]): GeoState | string {
    const key = semantics.join();
    const known = this._geos.get(geometry);
    if (known && known.key.startsWith(key + '#')) return known;
    if (geometry.drawRange.start !== 0 || Number.isFinite(geometry.drawRange.count)) return 'geometry:drawRange';
    if (Object.values(geometry.morphAttributes).some((l) => l.length > 0)) return 'morph';
    const geo: GeoState = { buffers: [], sources: [], layouts: [], index: null, index32: false, indexSource: null, indexSeen: -1, count: 0, key: '' };
    const bySource = new Map<object, number>();
    const parts: string[] = [];
    for (let loc = 0; loc < semantics.length; loc++) {
      const attr = geometry.attributes[semantics[loc]!];
      if (!attr) return `attribute:${semantics[loc]}`;
      const array = attr.isInterleavedBufferAttribute ? attr.data!.array : attr.array;
      const format = vertexFormat(array, attr.itemSize, attr.normalized);
      if (!format) return `format:${semantics[loc]}`;
      const bytes = (array as unknown as { BYTES_PER_ELEMENT: number }).BYTES_PER_ELEMENT;
      const stride = attr.isInterleavedBufferAttribute ? attr.data!.stride * bytes : attr.itemSize * bytes;
      const offset = attr.isInterleavedBufferAttribute ? (attr.offset ?? 0) * bytes : 0;
      const source = attr.isInterleavedBufferAttribute ? attr.data! : attr;
      let slot = bySource.get(source);
      if (slot === undefined) {
        slot = geo.buffers.length;
        bySource.set(source, slot);
        geo.buffers.push(this._uploadBuffer(array, BUFFER_VERTEX));
        geo.sources.push({ array, version: () => source.version, seen: source.version });
        geo.layouts.push({ arrayStride: stride, attributes: [] });
      }
      geo.layouts[slot]!.attributes.push({ shaderLocation: loc, offset, format });
      parts.push(`${slot}:${stride}:${offset}:${format}`);
    }
    if (geometry.index) {
      const idx = geometry.index;
      geo.index32 = !(idx.array instanceof Uint16Array);
      geo.index = this._uploadBuffer(idx.array, BUFFER_INDEX);
      geo.indexSource = idx;
      geo.indexSeen = idx.version;
      geo.count = idx.count;
    } else {
      geo.count = geometry.attributes['position']!.count;
    }
    geo.key = `${key}#${parts.join('|')}`;
    this._geos.set(geometry, geo);
    return geo;
  }

  private _refreshGeometry(geo: GeoState): void {
    for (let i = 0; i < geo.sources.length; i++) {
      const s = geo.sources[i]!;
      const v = s.version();
      if (v !== s.seen) {
        s.seen = v;
        this._device.queue.writeBuffer(geo.buffers[i], 0, s.array);
      }
    }
    const idx = geo.indexSource;
    if (idx && idx.version !== geo.indexSeen) {
      geo.indexSeen = idx.version;
      this._device.queue.writeBuffer(geo.index, 0, idx.array);
    }
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

  private _pipeline(inst: Inst, color: string, depth: string, samples: number, target: string): Gpu | null {
    const mat = inst.mat;
    const key = `${mat.model.name}|${mat.variant.join('+')}|${inst.geo.key}|${inst.cull}|${mat.textures.length}|${target}`;
    let pipeline = this._pipelines.get(key);
    if (pipeline) return pipeline;
    const codeKey = `${mat.model.name}|${mat.variant.join('+')}`;
    let module = this._modules.get(codeKey);
    if (!module) {
      const code = coreWgsl(mat.model.attributes(mat.variant), this._frameWgsl) + mat.model.wgsl(mat.variant);
      module = this._device.createShaderModule({ label: `native.${codeKey}`, code });
      this._modules.set(codeKey, module);
    }
    const layout = this._device.createPipelineLayout({
      bindGroupLayouts: [this._layouts.view, this._layouts.frame, this._materialLayout(mat.textures.length), this._layouts.object],
    });
    pipeline = this._device.createRenderPipeline({
      label: `native.${codeKey}`,
      layout,
      vertex: { module, entryPoint: 'vs', buffers: inst.geo.layouts },
      fragment: { module, entryPoint: 'fs', targets: [{ format: color }] },
      primitive: { topology: 'triangle-list', cullMode: inst.cull, frontFace: 'ccw' },
      depthStencil: { format: depth, depthWriteEnabled: true, depthCompare: 'less-equal' },
      multisample: { count: samples },
    });
    this._pipelines.set(key, pipeline);
    this.stats.pipelines++;
    return pipeline;
  }

  private _report(): void {
    const s = this.stats;
    const reasons = [...this._refusals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([r, n]) => `${r}=${n}`).join(' ');
    debug('perf', `[nativeRenderer] taken=${s.taken} refused=${s.refused} moved=${s.moved} params=${s.paramWrites} pipelines=${s.pipelines} recipes=${s.recipes} | ${reasons}`);
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
  return new NativeRenderer(host as NativeRendererHost, bridge, NATIVE_MODELS, nativeRendererModels());
}
