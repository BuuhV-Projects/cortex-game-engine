/**
 * Cheap sun shadow in the export: a PCF filter whose uniforms are shared
 * (SPEC-0445).
 *
 * The three's `PCFShadowFilter` (0.184) is a TSL `Fn` that creates
 * `reference('mapSize')` and `reference('radius')` INSIDE its body, so every
 * material that receives the shadow gets its own copies in the shared "render"
 * group — and since the three only shares a group between shader states when
 * their node lists match, every receiving state ends up with a "render" group of
 * its own, checked and rewritten every render (~1.6 ms per frame in the DDD 61).
 * Godot puts these parameters once per frame in its light buffer
 * (`light_storage.cpp:1279`). Here: the same filter, with the two references
 * created once per `LightShadow` — the same math, so the same image.
 *
 * Host only, on by default since the A/B (SPEC-0445: render -1.6/-1.9 ms walking,
 * -3.0 ms driving); `?sharedShadowFilter=0` turns it off.
 */
import { PCFShadowMap, PCFSoftShadowMap, type LightShadow, type Texture } from 'three';
import { ShadowNode } from 'three/webgpu';
import {
  Fn,
  add,
  fract,
  mix,
  interleavedGradientNoise,
  reference,
  renderGroup,
  screenCoordinate,
  texture,
  vec2,
  vogelDiskSample,
} from 'three/tsl';
import { debug } from '../core/debug.js';
import { queryFlagRequested } from './TransformOnlyRefresh.js';

const QUERY_KEY = 'sharedShadowFilter=';
/** Taps of the three's PCF (Vogel disk); kept identical for the same image. */
const PCF_TAPS = 5;
const TWO_PI = 6.28318530718;

/** The few TSL node methods the filter uses (the `@types/three` TSL typings fight literal ports). */
interface N {
  mul(...a: unknown[]): N;
  div(...a: unknown[]): N;
  add(...a: unknown[]): N;
  compare(...a: unknown[]): N;
  depth(...a: unknown[]): N;
  setGroup(...a: unknown[]): N;
  subAssign(...a: unknown[]): N;
  negate(): N;
  readonly xy: N;
  readonly x: N;
  readonly y: N;
  readonly z: N;
}
type TslFn = (...a: unknown[]) => N;
const t = { reference, texture, vec2, add, fract, mix, interleavedGradientNoise, vogelDiskSample } as unknown as Record<
  'reference' | 'texture' | 'vec2' | 'add' | 'fract' | 'mix' | 'interleavedGradientNoise' | 'vogelDiskSample',
  TslFn
>;
const screenXY = (screenCoordinate as unknown as N).xy;
const sharedRenderGroup: unknown = renderGroup;

/**
 * The two filter references, created once per shadow (the whole point). Keyed by
 * the shadow's `mapSize` vector: the `shadow` a TSL `Fn` body receives is NOT the
 * same object on every build (the call converts its arguments), so keying by it
 * misses every time and recreates the references — measured: same per-state ids
 * with the first version.
 */
const perShadow = new WeakMap<object, { mapSize: N; radius: N }>();

export function shadowRefs(shadow: LightShadow): { mapSize: N; radius: N } {
  const key = shadow.mapSize as object;
  let refs = perShadow.get(key);
  if (refs === undefined) {
    refs = {
      mapSize: t.reference('mapSize', 'vec2', shadow).setGroup(sharedRenderGroup),
      radius: t.reference('radius', 'float', shadow).setGroup(sharedRenderGroup),
    };
    perShadow.set(key, refs);
  }
  return refs;
}

interface FilterInputs {
  depthTexture: Texture & { isArrayTexture?: boolean };
  shadowCoord: N;
  shadow: LightShadow;
  depthLayer: N;
}

/** Literal copy of the three 0.184 `PCFShadowFilter`, with the shared references. */
export const sharedPCFShadowFilter = (Fn as unknown as (f: (i: FilterInputs) => N) => unknown)(
  ({ depthTexture, shadowCoord, shadow, depthLayer }) => {
    const depthCompare = (uv: N, compare: N): N => {
      let depth = t.texture(depthTexture, uv);
      if (depthTexture.isArrayTexture) depth = depth.depth(depthLayer);
      return depth.compare(compare);
    };
    const { mapSize, radius } = shadowRefs(shadow);
    const texelSize = t.vec2(1).div(mapSize);
    const radiusScaled = radius.mul(texelSize.x);
    // Same per-pixel rotation of the sampling pattern as the three (phi = IGN * 2π).
    const phi = t.interleavedGradientNoise(screenXY).mul(TWO_PI);
    const taps: N[] = [];
    for (let i = 0; i < PCF_TAPS; i++) {
      taps.push(depthCompare(shadowCoord.xy.add(t.vogelDiskSample(i, PCF_TAPS, phi).mul(radiusScaled)), shadowCoord.z));
    }
    return t.add(...taps).mul(1 / PCF_TAPS);
  },
);

/** Taps of the three's PCF soft filter (bilinear 3×3); the divisor of the sum. */
const PCF_SOFT_TAPS = 9;
const TWO = 2;
const HALF = 0.5;

/** Literal copy of the three 0.184 `PCFSoftShadowFilter`, with the shared `mapSize` (the engine's default type). */
export const sharedPCFSoftShadowFilter = (Fn as unknown as (f: (i: FilterInputs) => N) => unknown)(
  ({ depthTexture, shadowCoord, shadow, depthLayer }) => {
    const depthCompare = (uv: N, compare: N): N => {
      let depth = t.texture(depthTexture, uv);
      if (depthTexture.isArrayTexture) depth = depth.depth(depthLayer);
      return depth.compare(compare);
    };
    const { mapSize } = shadowRefs(shadow);
    const texelSize = t.vec2(1).div(mapSize);
    const dx = texelSize.x;
    const dy = texelSize.y;
    const uv = shadowCoord.xy;
    const f = t.fract(uv.mul(mapSize).add(HALF));
    uv.subAssign(f.mul(texelSize));
    const z = shadowCoord.z;
    return t.add(
      depthCompare(uv, z),
      depthCompare(uv.add(t.vec2(dx, 0)), z),
      depthCompare(uv.add(t.vec2(0, dy)), z),
      depthCompare(uv.add(texelSize), z),
      t.mix(depthCompare(uv.add(t.vec2(dx.negate(), 0)), z), depthCompare(uv.add(t.vec2(dx.mul(TWO), 0)), z), f.x),
      t.mix(depthCompare(uv.add(t.vec2(dx.negate(), dy)), z), depthCompare(uv.add(t.vec2(dx.mul(TWO), dy)), z), f.x),
      t.mix(depthCompare(uv.add(t.vec2(0, dy.negate())), z), depthCompare(uv.add(t.vec2(0, dy.mul(TWO))), z), f.y),
      t.mix(depthCompare(uv.add(t.vec2(dx, dy.negate())), z), depthCompare(uv.add(t.vec2(dx, dy.mul(TWO))), z), f.y),
      t.mix(
        t.mix(depthCompare(uv.add(t.vec2(dx.negate(), dy.negate())), z), depthCompare(uv.add(t.vec2(dx.mul(TWO), dy.negate())), z), f.x),
        t.mix(depthCompare(uv.add(t.vec2(dx.negate(), dy.mul(TWO))), z), depthCompare(uv.add(t.vec2(dx.mul(TWO), dy.mul(TWO))), z), f.x),
        f.y,
      ),
    ).mul(1 / PCF_SOFT_TAPS);
  },
);

/** On? Default of the caller; `?sharedShadowFilter=0|1` overrides. */
export function sharedShadowFilterRequested(fallback: boolean): boolean {
  return queryFlagRequested(QUERY_KEY, fallback);
}

let installed = false;

/** Makes every `ShadowNode` use the shared filters for `PCFShadowMap` and `PCFSoftShadowMap`. */
export function installSharedShadowFilter(): void {
  if (installed) return;
  installed = true;
  const proto = ShadowNode.prototype as unknown as { getShadowFilterFn(type: number): unknown };
  const original = proto.getShadowFilterFn;
  proto.getShadowFilterFn = function getShadowFilterFn(this: unknown, type: number): unknown {
    if (type === PCFShadowMap) return sharedPCFShadowFilter;
    if (type === PCFSoftShadowMap) return sharedPCFSoftShadowFilter;
    return original.call(this, type);
  };
  debug('perf', '[sharedShadowFilter] installed');
}
