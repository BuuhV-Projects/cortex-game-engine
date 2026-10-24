/**
 * Sun shadow block of the native renderer (group 1, bindings 8–15). Owned by the R1.3 front
 * (PRD-0466): the shadow map (first the three's, later the C++ shadow pass) and its PCFSoft
 * parameters in the view data, never per material (SPEC-0445, SPEC-0475).
 *
 * R1.1 ships the stub: no bindings, and `nativeShadow` returns 1 (lit). Models call it from day
 * one; until `SHADOW_READY` they must refuse `receiveShadow` objects (refuse instead of approximate).
 */
import type { FrameBlockFactory } from './FrameBlock.js';

export const SHADOW_FIRST_BINDING = 8;
export const SHADOW_LAST_BINDING = 15;
/** `true` once `nativeShadow` samples the real shadow map. */
export const SHADOW_READY = false;

/** WGSL every model can call: sun shadow factor (0 = shadowed, 1 = lit) at a world position. */
const SHADOW_WGSL = /* wgsl */ `
fn nativeShadow(positionWorld : vec3<f32>, normalWorld : vec3<f32>) -> f32 {
  return 1.0;
}
`;

export const createShadowBlock: FrameBlockFactory = () => ({
  name: 'shadow',
  version: 0,
  layoutEntries: () => [],
  resources: () => [],
  update: () => undefined,
  wgsl: SHADOW_WGSL,
});
