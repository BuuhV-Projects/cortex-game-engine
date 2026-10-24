/**
 * Lights block of the native renderer (group 1, bindings 0–7). Owned by the R1.2 front
 * (PRD-0466): directional + hemisphere + up to 8 local lights per view, one buffer, the
 * DDD 61's 8 SpotLights and the sun without the per-shader-state cost of the three.
 * R1.1 ships the empty block (no model reads lights yet).
 */
import { emptyFrameBlock, type FrameBlockFactory } from './FrameBlock.js';

export const LIGHTS_FIRST_BINDING = 0;
export const LIGHTS_LAST_BINDING = 7;

export const createLightsBlock: FrameBlockFactory = () => emptyFrameBlock('lights');
