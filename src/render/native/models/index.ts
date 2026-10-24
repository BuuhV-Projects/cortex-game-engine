/**
 * The fixed models of the native renderer (ADR-0465 §3). One line per model: each front of
 * the R1 (R1.2 lambert/standard, R1.5 game WGSL…) adds its own file and its line here.
 */
import type { NativeModelDef } from './NativeModel.js';
import { unlitModel } from './unlit.js';

export const NATIVE_MODELS: readonly NativeModelDef[] = [unlitModel];
