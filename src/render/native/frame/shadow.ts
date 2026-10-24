/**
 * Sun shadow block of the native renderer (group 1, bindings 8–15; R1.3, SPEC-0545): the sun's
 * shadow map and its PCFSoft parameters once per view, never per material (SPEC-0445/0475 — as
 * Godot's directional light buffer, `light_data_inc.glsl:72-87`).
 *
 * - The map is the three's `light.shadow.map.depthTexture` (found by identity through the
 *   backend). When it has to be redrawn, `NativeSunShadowPass` draws it in the C++ shadow pass
 *   (part 2); otherwise the three's `ShadowNode` does, as before.
 * - `update` runs at projection time, BEFORE the three's `ShadowNode.updateBefore` (draw time):
 *   on a redraw frame the block calls `shadow.updateMatrices` itself (what `renderShadow` does),
 *   so the matrix it writes matches the map drawn later in the same frame.
 * - `nativeShadow` is the three 0.184 PCFSoft (`wgsl-0019`, lambert+fog+receiveShadow) with
 *   `textureSampleCompareLevel`: same result on a mip-less depth map, and no uniformity rule
 *   (the three turns the diagnostic off at the module top, which a block cannot do).
 *
 * `?nativeShadow=0` disables the sampling (lit); `?nativeShadowShift=1` shifts the native
 * receivers' sampling by SHIFT_TEXELS — the known-answer case: the parity must FAIL.
 */
import { PCFSoftShadowMap } from 'three';
import { debug } from '../../../core/debug.js';
import { queryFlagRequested } from '../../TransformOnlyRefresh.js';
import type { NativeRendererHost } from '../NativeRenderer.js';
import type { FrameBlockFactory } from './FrameBlock.js';
import { NativeSunShadowPass, nativeShadowPassRequested, type SunLight } from '../shadow/NativeSunShadowPass.js';

export const SHADOW_FIRST_BINDING = 8;
export const SHADOW_LAST_BINDING = 15;
/** `true` once `nativeShadow` samples the real shadow map. */
export const SHADOW_READY = true;

const PARAMS_BINDING = SHADOW_FIRST_BINDING;
const SAMPLER_BINDING = SHADOW_FIRST_BINDING + 1;
const MAP_BINDING = SHADOW_FIRST_BINDING + 2;
/** `NativeShadowParams` (std140): matrix, normalBias, bias, mapSize, intensity, enabled, uvShift. */
export const SHADOW_PARAM_FLOATS = 24;
export const SHADOW_MATRIX_AT = 0;
export const SHADOW_NORMAL_BIAS_AT = 16;
export const SHADOW_BIAS_AT = 17;
export const SHADOW_MAP_SIZE_AT = 18;
export const SHADOW_INTENSITY_AT = 20;
export const SHADOW_ENABLED_AT = 21;
export const SHADOW_UV_SHIFT_AT = 22;
const MAT4_FLOATS = 16;
const FLOAT_BYTES = 4;
/** Taps of the three's PCFSoft (bilinear 3×3); the divisor of the sum. */
const PCF_SOFT_TAPS = 9;
/** Frames between scene searches for a shadow-casting sun while none is found. */
const LIGHT_RESCAN_FRAMES = 120;
/** Known-answer shift (`?nativeShadowShift=1`), in shadow-map texels. */
export const SHIFT_TEXELS = 8;

const BUFFER_UNIFORM = 0x40;
const BUFFER_COPY_DST = 0x08;
const TEXTURE_BINDING = 0x04;
const TEXTURE_RENDER_ATTACHMENT = 0x10;
const STAGE_VERTEX = 0x1;
const STAGE_FRAGMENT = 0x2;
/** Bound until the three's map has a GPU texture (the group needs a resource). */
const EMPTY_MAP_SIDE = 1;

const SHADOW_WGSL = /* wgsl */ `
struct NativeShadowParams {
  matrix : mat4x4<f32>,
  normalBias : f32,
  bias : f32,
  mapSize : vec2<f32>,
  intensity : f32,
  enabled : f32,
  uvShift : vec2<f32>,
};
@group(1) @binding(${PARAMS_BINDING}) var<uniform> nativeShadowParams : NativeShadowParams;
@group(1) @binding(${SAMPLER_BINDING}) var nativeShadowSampler : sampler_comparison;
@group(1) @binding(${MAP_BINDING}) var nativeShadowMap : texture_depth_2d;

fn nativeShadowTap(uv : vec2<f32>, z : f32) -> f32 {
  return textureSampleCompareLevel(nativeShadowMap, nativeShadowSampler, uv, z);
}

/** Sun shadow factor (0 = shadowed, 1 = lit), already mixed by the shadow intensity; multiplies the sun's direct term only. */
fn nativeShadow(positionWorld : vec3<f32>, normalWorld : vec3<f32>) -> f32 {
  let s = nativeShadowParams;
  if (s.enabled == 0.0) {
    return 1.0;
  }
  let clip = s.matrix * vec4<f32>(positionWorld + normalWorld * s.normalBias, 1.0);
  let ndc = clip.xyz / clip.w;
  var uv = vec2<f32>(ndc.x, 1.0 - ndc.y);
  let z = ndc.z + s.bias;
  if (!(uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0 && z <= 1.0)) {
    return 1.0;
  }
  uv = uv + s.uvShift;
  let texel = vec2<f32>(1.0) / s.mapSize;
  let f = fract(uv * s.mapSize + vec2<f32>(0.5));
  uv = uv - f * texel;
  let dx = texel.x;
  let dy = texel.y;
  let sum = nativeShadowTap(uv, z)
    + nativeShadowTap(uv + vec2<f32>(dx, 0.0), z)
    + nativeShadowTap(uv + vec2<f32>(0.0, dy), z)
    + nativeShadowTap(uv + texel, z)
    + mix(nativeShadowTap(uv + vec2<f32>(-dx, 0.0), z), nativeShadowTap(uv + vec2<f32>(dx * 2.0, 0.0), z), f.x)
    + mix(nativeShadowTap(uv + vec2<f32>(-dx, dy), z), nativeShadowTap(uv + vec2<f32>(dx * 2.0, dy), z), f.x)
    + mix(nativeShadowTap(uv + vec2<f32>(0.0, -dy), z), nativeShadowTap(uv + vec2<f32>(0.0, dy * 2.0), z), f.y)
    + mix(nativeShadowTap(uv + vec2<f32>(dx, -dy), z), nativeShadowTap(uv + vec2<f32>(dx, dy * 2.0), z), f.y)
    + mix(
        mix(nativeShadowTap(uv + vec2<f32>(-dx, -dy), z), nativeShadowTap(uv + vec2<f32>(dx * 2.0, -dy), z), f.x),
        mix(nativeShadowTap(uv + vec2<f32>(-dx, dy * 2.0), z), nativeShadowTap(uv + vec2<f32>(dx * 2.0, dy * 2.0), z), f.x),
        f.y);
  return mix(1.0, sum * (1.0 / ${PCF_SOFT_TAPS}.0), s.intensity);
}
`;

/* eslint-disable @typescript-eslint/no-explicit-any */
type Gpu = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

interface SceneLike {
  traverse(visit: (o: unknown) => void): void;
}

/** The renderer fields the block reads (the host IS the three renderer). */
interface ShadowRenderer {
  shadowMap?: { enabled: boolean; type: number };
}

function isSun(o: unknown): o is SunLight {
  const l = o as Partial<SunLight> & { isDirectionalLight?: boolean };
  return l.isDirectionalLight === true && l.castShadow === true && l.shadow !== undefined;
}

/** Group-1 shadow block: params UBO + comparison sampler + the sun's depth map. */
export class ShadowBlock {
  readonly name = 'shadow';
  readonly wgsl = SHADOW_WGSL;
  version = 0;
  private readonly _params: Gpu;
  private readonly _sampler: Gpu;
  private readonly _empty: Gpu;
  private readonly _data = new Float32Array(SHADOW_PARAM_FLOATS);
  private readonly _last = new Float32Array(SHADOW_PARAM_FLOATS).fill(Number.NaN);
  private _map: Gpu = null;
  private _light: SunLight | null = null;
  private _scene: unknown = null;
  private _frame = 0;
  private _searchedAt = -LIGHT_RESCAN_FRAMES;
  private _lastReport = '';

  constructor(
    private readonly _device: Gpu,
    private readonly _host: NativeRendererHost,
    private readonly _on = queryFlagRequested('nativeShadow=', true),
    private readonly _shift = queryFlagRequested('nativeShadowShift=', false),
    private readonly _pass: NativeSunShadowPass | null = nativeShadowPassRequested() ? new NativeSunShadowPass(_host) : null,
  ) {
    this._params = _device.createBuffer({ label: 'native.shadow', size: SHADOW_PARAM_FLOATS * FLOAT_BYTES, usage: BUFFER_UNIFORM | BUFFER_COPY_DST });
    // Same sampling as the three's shadow DepthTexture: LessEqual, nearest (PCFSoft filters by hand), clamp.
    this._sampler = _device.createSampler({
      label: 'native.shadow',
      compare: 'less-equal',
      magFilter: 'nearest',
      minFilter: 'nearest',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });
    this._empty = _device.createTexture({
      label: 'native.shadow.empty',
      size: [EMPTY_MAP_SIDE, EMPTY_MAP_SIDE],
      format: 'depth32float',
      usage: TEXTURE_BINDING | TEXTURE_RENDER_ATTACHMENT,
    });
  }

  layoutEntries(): unknown[] {
    return [
      { binding: PARAMS_BINDING, visibility: STAGE_VERTEX | STAGE_FRAGMENT, buffer: { type: 'uniform' } },
      { binding: SAMPLER_BINDING, visibility: STAGE_FRAGMENT, sampler: { type: 'comparison' } },
      { binding: MAP_BINDING, visibility: STAGE_FRAGMENT, texture: { sampleType: 'depth' } },
    ];
  }

  resources(): unknown[] {
    return [
      { binding: PARAMS_BINDING, resource: { buffer: this._params } },
      { binding: SAMPLER_BINDING, resource: this._sampler },
      { binding: MAP_BINDING, resource: (this._map ?? this._empty).createView() },
    ];
  }

  update(scene: unknown, camera: unknown): void {
    this._frame++;
    const d = this._data;
    const why = this._write(scene, camera, d);
    d[SHADOW_ENABLED_AT] = why === null ? 1 : 0;
    this._report(why ?? 'amostrando');
    const last = this._last;
    for (let i = 0; i < SHADOW_PARAM_FLOATS; i++) {
      if (d[i] !== last[i]) {
        last.set(d);
        this._device.queue.writeBuffer(this._params, 0, d);
        return;
      }
    }
  }

  /** Fills the params of this frame; `null` = sampling, otherwise why the shadow is off. */
  private _write(scene: unknown, camera: unknown, d: Float32Array): string | null {
    if (!this._on) return 'desligada';
    const sm = (this._host as unknown as ShadowRenderer).shadowMap;
    if (!sm?.enabled) return 'shadowMap-desligado';
    if (sm.type !== PCFSoftShadowMap) return `tipo:${sm.type}`;
    const light = this._findLight(scene);
    if (light === null) return 'sem-sol';
    const shadow = light.shadow;
    // A redraw happens this frame (three or C++): match the matrix it will use.
    if (shadow.needsUpdate || shadow.autoUpdate) shadow.updateMatrices(light);
    this._pass?.update(light, scene, camera);
    const depth = shadow.map?.depthTexture;
    const gpu = depth ? (this._host.backend.get(depth)['texture'] ?? null) : null;
    // ponytail: no own DepthTexture; while the three never created its map there is no shadow (R1.6 adds it).
    if (gpu === null) return 'mapa-sem-gpu';
    if (gpu !== this._map) {
      this._map = gpu;
      this.version++;
    }
    const m = shadow.matrix.elements;
    for (let i = 0; i < MAT4_FLOATS; i++) d[SHADOW_MATRIX_AT + i] = m[i]!;
    d[SHADOW_NORMAL_BIAS_AT] = shadow.normalBias;
    d[SHADOW_BIAS_AT] = shadow.bias;
    d[SHADOW_MAP_SIZE_AT] = shadow.mapSize.x;
    d[SHADOW_MAP_SIZE_AT + 1] = shadow.mapSize.y;
    d[SHADOW_INTENSITY_AT] = shadow.intensity;
    d[SHADOW_UV_SHIFT_AT] = this._shift ? SHIFT_TEXELS / shadow.mapSize.x : 0;
    d[SHADOW_UV_SHIFT_AT + 1] = 0;
    return null;
  }

  /** The scene's shadow-casting DirectionalLight, cached; searched again every LIGHT_RESCAN_FRAMES while missing. */
  private _findLight(scene: unknown): SunLight | null {
    const known = this._light;
    if (known !== null && this._scene === scene && known.castShadow && known.parent !== null) return known;
    this._light = null;
    if (this._scene === scene && this._frame - this._searchedAt < LIGHT_RESCAN_FRAMES) return null;
    this._scene = scene;
    this._searchedAt = this._frame;
    let found: SunLight | null = null;
    (scene as SceneLike).traverse((o) => {
      if (found === null && isSun(o)) found = o;
    });
    this._light = found;
    return found;
  }

  private _report(state: string): void {
    if (state === this._lastReport) return;
    this._lastReport = state;
    debug('perf', `[nativeShadow] ${state}`);
  }
}

export const createShadowBlock: FrameBlockFactory = (device, host) => new ShadowBlock(device, host);
