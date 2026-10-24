/**
 * The fixed models of the native renderer (ADR-0465 §3). One line per model: each front of
 * the R1 (R1.2 lambert/standard, R1.5 game WGSL…) adds its own file and its line here.
 */
import type { NativeModelDef } from './NativeModel.js';
import { unlitModel } from './unlit.js';
import { lambertModel } from './lambert.js';

export const NATIVE_MODELS: readonly NativeModelDef[] = [unlitModel, lambertModel];
// standard (models/standard.ts) is off until the Comercial facade parity is fixed (SPEC-0535, pending).
