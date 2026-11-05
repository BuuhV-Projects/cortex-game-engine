/**
 * Constants, shapes and pure helpers of the native renderer (R1.1, SPEC-0495, ADR-0465): query
 * flags, the WebGPU/three shapes it reads, `vertexFormat` and `drawState`. Split out of
 * `NativeRenderer.ts` (SPEC-0682, SPEC-0668); `NativeRenderer.ts` re-exports the public part.
 */
import type { Material, Object3D } from 'three';
import type { NativeEntry } from '../RenderServer.js';
import { queryFlagRequested } from '../TransformOnlyRefresh.js';
import type { NativeModelDef } from './models/NativeModel.js';

export const QUERY_KEY = 'nativeRenderer=';
export const MODELS_QUERY = 'nativeRendererModels=';
/** WebGPU default `minUniformBufferOffsetAlignment`: one object block per 256 bytes. */
export const UNIFORM_ALIGN_BYTES = 256;
export const OBJECT_SLOTS_PER_CHUNK = 256;
export const FLOAT_BYTES = 4;
export const MAT4_FLOATS = 16;
export const TRIANGLE_VERTICES = 3;
export const NO_RECIPE = -1;
/** `MatState.textureVersions` entry of a texture not bound yet: never equal to a `texture.version`. */
export const NOT_READY = -1;
/** Projections between reports on `debug('perf')`, plus one early report for short rounds. */
export const REPORT_FRAMES = 600;
export const EARLY_REPORT_FRAME = 120;
/** Refusal reasons listed per report (most frequent first). */
export const REPORT_REASONS = 8;
/** Decimals of the pipeline creation ms on `debug('perf')`. */
export const MS_DIGITS = 2;
/**
 * `?nativeTint=1`: adds TINT_DELTA to the red of every material the native renderer draws, and
 * only there — the known-answer case of the same-run parity (SPEC-0495): it must FAIL.
 */
export const TINT_QUERY = 'nativeTint=';
/** `?nativePrecompile=1`: warm-up through the native renderer (SPEC-0585), off until accepted. */
export const PRECOMPILE_QUERY = 'nativePrecompile=';
/** `?nativeDepthOnly=0`: the depth-only occluder (`colorWrite=false`) goes back to the three (A/B, SPEC-0585). */
export const DEPTH_ONLY_QUERY = 'nativeDepthOnly=';
export const TINT_DELTA = 8 / 255;
/** three constants (kept local). */
export const FRONT_SIDE = 0;
export const BACK_SIDE = 1;
export const DOUBLE_SIDE = 2;
export const NORMAL_BLENDING = 1;
export const ADDITIVE_BLENDING = 2;
export const LESS_EQUAL_DEPTH = 3;
export const NO_TONE_MAPPING = 0;
/** `instanceMatrix`: 16 floats per instance, read as 4 vec4 columns (SPEC-0555). */
export const MAT4_COLUMN_BYTES = 16;
/** Without `scene.fog`, near/far this large make `smoothstep` return 0: no fog. */
export const NO_FOG_NEAR = 1e37;
export const NO_FOG_FAR = 2e37;
/** Refusals worth retrying next frame (the texture is still loading). */
export const RETRY_REASONS = new Set(['texture']);
/**
 * Object/pipeline features: the core's, not the models' (see `models/NativeModel.ts`). Removed
 * from the classification before the model sees it; refused unless supported below.
 */
export const CORE_FEATURES = new Set(['instanced', 'skinned', 'transparent', 'additive', 'noDepthWrite', 'noColorWrite', 'polygonOffset', 'renderOrder', 'doubleSide']);
/** What the core draws today (R1.4, SPEC-0555: instancing, transparency, state). R1.5 adds skinning. */
export const CORE_SUPPORTED = new Set(['doubleSide', 'instanced', 'transparent', 'additive', 'noDepthWrite', 'noColorWrite', 'polygonOffset', 'renderOrder', 'skinned']);
/** `GPUColorWrite.NONE`: `colorWrite=false` writes depth only. */
export const COLOR_WRITE_NONE = 0;
/** Vertex semantics every model may read without declaring their type (`attributeTypes` is for the rest). */
export const BUILTIN_SEMANTICS = new Set<string>(['position', 'normal', 'uv', 'color', 'instanceColor']);
/** Skin attributes the core appends after the model's (`coreWgsl` with `skinned`). */
export const SKIN_SEMANTICS = ['skinIndex', 'skinWeight'];
/** Skin storage: bindMatrix + bindMatrixInverse, then the bone matrices (SPEC-0565). */
export const SKIN_HEADER_FLOATS = 2 * 16;
/** three `FloatType`: not filterable (RGBA32F), read with `textureLoad` (a DataTexture of instance data). */
export const FLOAT_TYPE = 1015;
export const UNFILTERABLE = 'u';
export const FILTERABLE = 'f';
/** Vertex semantics read from the object, not the geometry. */
export const OBJECT_SEMANTICS = new Set<string>(['instanceColor']);
/**
 * Blend states of the three's `_getBlending` (not premultiplied). Normal blending only when the
 * material is transparent (the three draws an opaque normal material without blending).
 */
export const BLEND_STATES = {
  normal: {
    color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  },
  additive: {
    color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' },
    alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
  },
} as const;
export type Blend = 'none' | keyof typeof BLEND_STATES;
export const MAT3_COLUMNS = 3;
export const ROW_FLOATS = 4;

export const BUFFER_UNIFORM = 0x40;
export const BUFFER_COPY_DST = 0x08;
export const BUFFER_VERTEX = 0x20;
export const BUFFER_INDEX = 0x10;
export const BUFFER_STORAGE = 0x80;
export const STAGE_VERTEX = 0x1;
export const STAGE_FRAGMENT = 0x2;

/** Default of the native-renderer flags when the query does not say: the game's option (ADR-0605). */
let gameDefault = false;

/**
 * Sets the default of `?nativeRenderer` and `?nativePrecompile` (ADR-0605, SPEC-0606): `Game` calls it with
 * `GameOptions.nativeRenderer`. The query still wins (`?nativeRenderer=0` back to the three).
 */
export function setNativeRendererDefault(on: boolean): void {
  gameDefault = on;
}

export function nativeRendererRequested(fallback = gameDefault): boolean {
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
export type Gpu = any;
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

/** The three's uploaded GPU texture, uploading it (and its sampler) through the three's path if needed; `null` = not ready. */
export function uploadedTexture(host: NativeRendererHost, texture: unknown): unknown {
  host._textures.updateTexture(texture);
  host._textures.updateSampler(texture);
  return host.backend.get(texture)['texture'] ?? null;
}

export interface AttributeLike {
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
export interface GeometryLike {
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
export interface VertexSet {
  /** One GPU buffer per source array (interleaved attributes share one). */
  buffers: Gpu[];
  /** `src` = the attribute (or its interleaved buffer); `array` = what was uploaded. */
  sources: Array<{ src: { array: ArrayBufferView; version: number }; array: ArrayBufferView; seen: number }>;
  layouts: Array<{ arrayStride: number; stepMode: 'vertex' | 'instance'; attributes: Array<{ shaderLocation: number; offset: number; format: string }> }>;
  key: string;
}

export interface GeoState extends VertexSet {
  index: Gpu | null;
  index32: boolean;
  indexSource: AttributeLike | null;
  indexSeen: number;
  /** A source array was replaced: the next instance built on this geometry uploads it again. */
  stale: boolean;
}

/** Pipeline state of an instance (SPEC-0555): blend, depth write, depth bias, cull per pass. */
export interface DrawState {
  blend: Blend;
  depthWrite: boolean;
  /** `material.colorWrite`: `false` = writeMask 0 (depth-only occluder). */
  colorWrite: boolean;
  /** `[polygonOffsetUnits, polygonOffsetFactor]`, or `null` without `polygonOffset`. */
  bias: [number, number] | null;
  /** Cull mode of each pass, in draw order (transparent DoubleSide: back faces first). */
  culls: string[];
  key: string;
}

export interface MatState {
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

/** Uma receita gravada: id na ponte e as gerações (material, grupo 1) com que foi gravada. */
export interface RecipeRecord {
  id: number;
  generation: number;
  frame: number;
}

export interface Inst extends NativeEntry {
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
  /** World matrix version whose matrix is in `last` and the object block (SPEC-0682); -1 = none. */
  worldVersion: number;
  recipes: Map<string, RecipeRecord>;
  /** Por passe (SPEC-0685): id do alvo da última receita devolvida (`NO_TARGET` = nenhuma) e o registro dela. */
  passTarget: Int32Array;
  passRecipe: RecipeRecord[];
  // Per frame (`getDrawParameters` of the three): drawRange, InstancedMesh.count.
  count: number;
  first: number;
  triangles: number;
  instances: number;
  passes: number;
  transparent: boolean;
  /** `receiveShadow` variant: samples the sun shadow (counted for `csmReceivers`, SPEC-0690). */
  receivesShadow: boolean;
}

/** Refused (object, material, geometry): checked again only when one of them changes. */
export interface Refusal {
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

const CULL_OF_SIDE: Record<number, string> = { [FRONT_SIDE]: 'back', [BACK_SIDE]: 'front', [DOUBLE_SIDE]: 'none' };

/**
 * Pipeline state of a material, as the three's `WebGPUPipelineUtils` builds it (SPEC-0555): blend
 * only when not opaque, `depthWrite`, `colorWrite` as writeMask (SPEC-0585), `polygonOffset` as depth
 * bias; a transparent `DoubleSide`
 * material (without `forceSinglePass`) is drawn twice like `Renderer._renderObject` does: back
 * faces (cull `front`), then front faces (cull `back`).
 */
export function drawState(
  m: { blending: number; transparent: boolean; depthWrite: boolean; colorWrite?: boolean; side: number; forceSinglePass?: boolean; polygonOffset: boolean; polygonOffsetUnits?: number; polygonOffsetFactor?: number },
  opaque: boolean,
): DrawState {
  const blend: Blend = opaque ? 'none' : m.blending === ADDITIVE_BLENDING ? 'additive' : 'normal';
  const bias: [number, number] | null = m.polygonOffset ? [m.polygonOffsetUnits ?? 0, m.polygonOffsetFactor ?? 0] : null;
  const culls = m.transparent && m.side === DOUBLE_SIDE && !m.forceSinglePass ? ['front', 'back'] : [CULL_OF_SIDE[m.side] ?? 'back'];
  const colorWrite = m.colorWrite !== false;
  return {
    blend, depthWrite: m.depthWrite, colorWrite, bias, culls,
    key: `${blend}|${m.depthWrite ? 'w' : '-'}|${bias ? bias.join(',') : ''}${colorWrite ? '' : '|c-'}`,
  };
}

/** The color target of a pipeline: blend when not opaque, writeMask 0 without `colorWrite`. */
export function colorTarget(s: DrawState, format: string): Record<string, unknown> {
  const target: Record<string, unknown> = { format };
  if (s.blend !== 'none') target['blend'] = BLEND_STATES[s.blend];
  if (!s.colorWrite) target['writeMask'] = COLOR_WRITE_NONE;
  return target;
}

/** `?nativePrecompile=1` (SPEC-0585); without it, the game's option (ADR-0605). */
export function nativePrecompileRequested(): boolean {
  return queryFlagRequested(PRECOMPILE_QUERY, gameDefault);
}
