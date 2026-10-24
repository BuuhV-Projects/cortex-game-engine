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
 * Host only, behind `?dynamicLighting=1` until the A/B (SPEC-0435). The Studio
 * keeps the default lighting.
 */
import type { Light } from 'three';
import { DynamicLighting } from 'three/examples/jsm/lighting/DynamicLighting.js';
import DynamicLightsNode from 'three/examples/jsm/tsl/lighting/DynamicLightsNode.js';
import { debug } from '../core/debug.js';
import { queryFlagRequested } from './TransformOnlyRefresh.js';

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

/**
 * `DynamicLightsNode.hasLights` reads `super.hasLights`; the export's Babel
 * compiles that to `LightsNode.prototype.hasLights`, so the getter runs with the
 * prototype as `this` and throws (`_lights` undefined): the light node fails to
 * build, materials do not compile and objects silently stop drawing — measured
 * as a fake -6 ms. Same answer, no `super`.
 */
class HostDynamicLightsNode extends DynamicLightsNode {
  override get hasLights(): boolean {
    const self = this as unknown as { _lights: readonly Light[]; _dataNodes: ReadonlyMap<string, unknown> };
    return self._lights.length > 0 || self._dataNodes.size > 0;
  }
}

/** `DynamicLighting` that builds {@link HostDynamicLightsNode}. */
class HostDynamicLighting extends DynamicLighting {
  override createNode(lights: Light[] = []): HostDynamicLightsNode {
    return new HostDynamicLightsNode(this.options).setLights(lights) as HostDynamicLightsNode;
  }
}

/** On? Default of the caller (off until the A/B); `?dynamicLighting=1` turns it on. */
export function dynamicLightingRequested(fallback: boolean): boolean {
  return queryFlagRequested(QUERY_KEY, fallback);
}

/** Swaps the renderer's lighting for `DynamicLighting`. Call before the first render. */
export function installDynamicLighting(renderer: { lighting: unknown }): void {
  renderer.lighting = new HostDynamicLighting({
    maxDirectionalLights: MAX_DIRECTIONAL_LIGHTS,
    maxPointLights: MAX_POINT_LIGHTS,
    maxSpotLights: MAX_SPOT_LIGHTS,
    maxHemisphereLights: MAX_HEMISPHERE_LIGHTS,
  });
  debug('perf', '[dynamicLighting] installed');
}
