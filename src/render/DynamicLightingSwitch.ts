/**
 * (d′) of SPEC-0435: the three's own `DynamicLighting` in the native host.
 *
 * The default lighting of the three gives every shader state its own light
 * nodes and copies every light uniform into that state's "render" UBO, updated
 * per state per render (~3–4 ms per frame in the DDD 61). `DynamicLighting`
 * batches the lights WITHOUT shadow (spot, point, hemisphere, ambient,
 * directional without shadow) into one data node per light type — fixed-size
 * uniform arrays plus a count, updated once per render, looped in the shader —
 * the same idea as Godot's per-frame light buffer. Turning a light on/off
 * changes the count, not the shader variant. Shadow-casting lights stay on the
 * default path.
 *
 * Host only, on by default since the A/B (SPEC-0435: render -1.4/-1.7 ms walking,
 * night parity 6 px of 921,600); `?dynamicLighting=0` turns it off. The Studio
 * keeps the default lighting.
 */
import { DynamicLighting } from 'three/examples/jsm/lighting/DynamicLighting.js';
import { debug } from '../core/debug.js';
import { queryFlagRequested } from './TransformOnlyRefresh.js';
import { mainPassArm } from './MainPassArm.js';

const QUERY_KEY = 'dynamicLighting=';

/**
 * Array sizes of the data nodes. Lights beyond them are dropped by the three
 * (with a warning), so they cover the DDD 61 (8 spots) with room; a bigger
 * array costs per state (it lives in each state's "render" UBO).
 */
const MAX_DIRECTIONAL_LIGHTS = 2;
const MAX_POINT_LIGHTS = 8;
const MAX_SPOT_LIGHTS = 8;
const MAX_HEMISPHERE_LIGHTS = 1;

/** On? Default of the caller (the host passes `true`); `?dynamicLighting=0` turns it off. */
export function dynamicLightingRequested(fallback: boolean): boolean {
  return queryFlagRequested(QUERY_KEY, fallback);
}

/** Both lightings, kept for the same-run parity instrument (`?parityTarget=lighting`). */
const lightings: { base: unknown; dynamic: unknown } = { base: null, dynamic: null };

/** Swaps the renderer's lighting for `DynamicLighting`. Call before the first render. */
export function installDynamicLighting(renderer: { lighting: unknown }): void {
  lightings.base = renderer.lighting;
  renderer.lighting = lightings.dynamic = new DynamicLighting({
    maxDirectionalLights: MAX_DIRECTIONAL_LIGHTS,
    maxPointLights: MAX_POINT_LIGHTS,
    maxSpotLights: MAX_SPOT_LIGHTS,
    maxHemisphereLights: MAX_HEMISPHERE_LIGHTS,
  });
  debug('perf', '[dynamicLighting] installed');
}

/**
 * Same-run parity (SPEC-0435): with `?parityFreeze` + `?parityTarget=lighting`
 * the frozen frames alternate the base and the dynamic lighting, so frame N vs
 * N+1 compares the two light models on the very same scene. Called every frame;
 * no-op unless the dynamic lighting was installed.
 */
export function applyParityLighting(renderer: { lighting: unknown }): void {
  if (lightings.dynamic === null) return;
  const r = renderer as { lighting: unknown; _renderLists?: { lighting: unknown; constructor: new (lighting: unknown) => unknown } };
  const lists = r._renderLists;
  if (!lists) return;
  // The three captures the lighting at init, in its `RenderLists` (and each list
  // keeps the `lightsNode` it was built with): swapping `renderer.lighting` alone
  // changes nothing. One `RenderLists` per lighting, swapped together.
  if (listsByLighting.size === 0) listsByLighting.set(lists.lighting, lists);
  const want = mainPassArm.lighting ? lightings.base : lightings.dynamic;
  if (lists.lighting === want) return;
  let next = listsByLighting.get(want);
  if (next === undefined) {
    next = new lists.constructor(want) as typeof lists;
    listsByLighting.set(want, next);
  }
  r._renderLists = next;
  r.lighting = want;
  if (++parityLightingSwaps % PARITY_REPORT_SWAPS === 0) debug('perf', `[dynamicLighting] parity swaps=${parityLightingSwaps}`);
}

/** `RenderLists` per lighting for the parity instrument. */
const listsByLighting = new Map<unknown, { lighting: unknown; constructor: new (lighting: unknown) => unknown }>();
/** Swaps done by the parity instrument (an instrument has to report how much it switched). */
let parityLightingSwaps = 0;
const PARITY_REPORT_SWAPS = 60;
