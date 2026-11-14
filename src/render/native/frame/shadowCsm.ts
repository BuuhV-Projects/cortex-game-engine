/**
 * CSM mode of the native sun shadow block (SPEC-0690, ADR-0691): the receivers read the cascades the C++ shadow
 * pass draws, one `texture_depth_2d` per cascade (bindings 10–15) and one UBO entry per cascade. `shadow.ts` only
 * picks the mode: `cascadeCount = 0` keeps the single-map path of SPEC-0545 untouched, `> 0` samples the cascades.
 * The WGSL is generated for the cascades in use by `shadowWgsl.ts` (SPEC-0732).
 *
 * The cascade choice and the fade are the three's `CSMShadowNode._setupFade`/`_setupStandard` (three 0.184), ported
 * as is — the same margin (`0.25 · edge²`), the same curve, the first cascade never fading at its near edge. The
 * pure TS port (`scene/csm/csmCascadeMath.ts`) is what the parity test compares against the three.
 */
import { SHADOW_FIRST_BINDING, SHADOW_PARAM_FLOATS } from './shadowLayout.js';

/** Cascades the receiver can read: bindings 10..15 (ADR-0691; the engine default is 3, the DDD 00 uses 2). */
export const CSM_MAX_CASCADES = 6;
/** Binding of cascade 0 (the single map of the old mode); cascade `i` is at `CSM_FIRST_MAP_BINDING + i`. */
export const CSM_FIRST_MAP_BINDING = SHADOW_FIRST_BINDING + 2;

/** `NativeShadowParams.csm` (vec4): camera near, shadowFar, cascade count, fade; right after the single-map fields. */
export const SHADOW_CSM_AT = SHADOW_PARAM_FLOATS;
export const CSM_CAMERA_NEAR_AT = SHADOW_CSM_AT;
export const CSM_SHADOW_FAR_AT = SHADOW_CSM_AT + 1;
export const CSM_COUNT_AT = SHADOW_CSM_AT + 2;
export const CSM_FADE_AT = SHADOW_CSM_AT + 3;
/** `NativeShadowParams.cascades` (array, 16-byte aligned). */
export const CSM_CASCADES_AT = SHADOW_CSM_AT + 4;
/** `NativeShadowCascade` (std140): mat4 + vec4(bias, normalBias, enabled, 0) + vec2(near, far), padded to 16 bytes. */
export const CSM_CASCADE_FLOATS = 24;
export const CASCADE_MATRIX_AT = 0;
export const CASCADE_BIAS_AT = 16;
export const CASCADE_NORMAL_BIAS_AT = 17;
export const CASCADE_ENABLED_AT = 18;
export const CASCADE_RANGE_AT = 20;
/** Floats of the whole UBO: the single-map fields, `csm` and `CSM_MAX_CASCADES` cascades. */
export const SHADOW_UBO_FLOATS = CSM_CASCADES_AT + CSM_MAX_CASCADES * CSM_CASCADE_FLOATS;

const MAT4_FLOATS = 16;

/** One cascade as the receiver reads it (the CSM node fills it after its native pass, SPEC-0690). */
export interface CsmCascadeReceiver {
  /** Sampled this frame: drawn (or kept by the far-cascade interval) and accepted. Refused = lit (factor 1). */
  enabled: boolean;
  /** `shadow.matrix` of the LAST draw of this cascade (not recomputed on a frame it was not drawn). */
  readonly matrix: Float32Array;
  /** The `GPUTexture` of the cascade's depth map, or `null` while it has none. */
  texture: unknown;
  bias: number;
  normalBias: number;
  /** The cascade's range (`_cascades[i]`), fractions of `shadowFar`. */
  near: number;
  far: number;
}

/** The CSM node's state for the receivers (`CameraFollowingCSM.nativeReceiverState`). */
export interface CsmReceiverState {
  count: number;
  cameraNear: number;
  /** `min(maxFar, camera.far)`, as the three's `shadowFar` uniform. */
  shadowFar: number;
  fade: boolean;
  mapWidth: number;
  mapHeight: number;
  intensity: number;
  readonly cascades: readonly CsmCascadeReceiver[];
}

/** The CSM node as the shadow block sees it: `sun.shadow.shadowNode` with `isCSMShadowNode`. */
export interface CsmShadowSource {
  readonly isCSMShadowNode: true;
  /** Repositions and draws the cascades (once per frame, SPEC-0690 item 1). */
  updateNative(camera: unknown, scene: unknown, renderer: unknown, frameId: number): void;
  nativeReceiverState(): CsmReceiverState;
}

/** The CSM node of a shadow, when there is one that the native side can drive. */
export function csmShadowSource(shadow: { shadowNode?: unknown }): CsmShadowSource | null {
  const node = shadow.shadowNode as Partial<CsmShadowSource> | null | undefined;
  return node?.isCSMShadowNode === true && typeof node.updateNative === 'function' ? (node as CsmShadowSource) : null;
}

/** The cascade struct, declared before `NativeShadowParams`. */
export const CSM_STRUCT_WGSL = /* wgsl */ `
struct NativeShadowCascade {
  matrix : mat4x4<f32>,
  bias : vec4<f32>,
  range : vec2<f32>,
};`;

/** Layout entries of cascades 1..5 (cascade 0 is the block's map binding). */
export function csmMapLayoutEntries(fragmentStage: number): unknown[] {
  return Array.from({ length: CSM_MAX_CASCADES - 1 }, (_, i) => ({
    binding: CSM_FIRST_MAP_BINDING + i + 1,
    visibility: fragmentStage,
    texture: { sampleType: 'depth' },
  }));
}

/** Single-map mode: no cascades (the WGSL takes the old path). */
export function writeSingleMapMode(d: Float32Array): void {
  d[CSM_COUNT_AT] = 0;
}

/**
 * Writes the CSM fields of this frame and the GPU texture of each cascade into `maps` (index = cascade).
 *
 * @returns `null` while at least one cascade is sampled, otherwise why the shadow is off.
 */
export function writeCsmParams(state: CsmReceiverState, d: Float32Array, maps: unknown[]): string | null {
  const count = Math.min(state.count, CSM_MAX_CASCADES);
  d[CSM_CAMERA_NEAR_AT] = state.cameraNear;
  d[CSM_SHADOW_FAR_AT] = state.shadowFar;
  d[CSM_COUNT_AT] = count;
  d[CSM_FADE_AT] = state.fade ? 1 : 0;
  let sampled = 0;
  for (let i = 0; i < CSM_MAX_CASCADES; i++) {
    const at = CSM_CASCADES_AT + i * CSM_CASCADE_FLOATS;
    const cascade = i < count ? state.cascades[i] : undefined;
    const on = cascade !== undefined && cascade.enabled && cascade.texture !== null && cascade.texture !== undefined;
    maps[i] = on ? cascade.texture : null;
    d[at + CASCADE_ENABLED_AT] = on ? 1 : 0;
    if (cascade === undefined) continue;
    if (on) sampled++;
    for (let k = 0; k < MAT4_FLOATS; k++) d[at + CASCADE_MATRIX_AT + k] = cascade.matrix[k]!;
    d[at + CASCADE_BIAS_AT] = cascade.bias;
    d[at + CASCADE_NORMAL_BIAS_AT] = cascade.normalBias;
    d[at + CASCADE_RANGE_AT] = cascade.near;
    d[at + CASCADE_RANGE_AT + 1] = cascade.far;
  }
  if (count === 0) return 'csm-sem-cascata';
  return sampled > 0 ? null : 'csm-cascatas-recusadas';
}
