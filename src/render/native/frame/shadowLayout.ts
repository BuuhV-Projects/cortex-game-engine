/**
 * Group-1 bindings and UBO offsets of the sun shadow block (SPEC-0545), shared by `shadow.ts` and its CSM mode
 * (`shadowCsm.ts`, SPEC-0690) without an import cycle between the two.
 */
export const SHADOW_FIRST_BINDING = 8;
export const SHADOW_LAST_BINDING = 15;

/** `NativeShadowParams` single-map fields (std140): matrix, normalBias, bias, mapSize, intensity, enabled, uvShift. */
export const SHADOW_PARAM_FLOATS = 24;
export const SHADOW_MATRIX_AT = 0;
export const SHADOW_NORMAL_BIAS_AT = 16;
export const SHADOW_BIAS_AT = 17;
export const SHADOW_MAP_SIZE_AT = 18;
export const SHADOW_INTENSITY_AT = 20;
export const SHADOW_ENABLED_AT = 21;
export const SHADOW_UV_SHIFT_AT = 22;
