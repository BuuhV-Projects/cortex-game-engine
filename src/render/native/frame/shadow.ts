/**
 * Sun shadow block of the native renderer (group 1, bindings 8–15). Owned by the R1.3 front
 * (PRD-0466): the shadow map drawn by the C++ shadow pass and its PCFSoft parameters in the
 * view data, never per material (SPEC-0445, SPEC-0475). R1.1 ships the empty block.
 */
import { emptyFrameBlock, type FrameBlockFactory } from './FrameBlock.js';

export const SHADOW_FIRST_BINDING = 8;
export const SHADOW_LAST_BINDING = 15;
/**
 * `true` once this block samples the real shadow map: until then models must refuse
 * `receiveShadow` objects that would show a shadow (refuse instead of approximate).
 */
export const SHADOW_READY = false;

export const createShadowBlock: FrameBlockFactory = () => emptyFrameBlock('shadow');
