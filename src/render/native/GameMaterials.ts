/**
 * Game WGSL materials of the native renderer (R1.5, SPEC-0565, ADR-0566). A game draws a TSL
 * material the fixed models do not cover (crowds pulled from a `DataTexture`, tints, the sea) in
 * the export with its own WGSL: it registers a {@link NativeModelDef} under a name and marks the
 * material with `userData.nativeMaterial = name`. The core gives the model instancing, skinning,
 * pipeline state, transparency and the three's draw order; the Studio keeps drawing the TSL.
 */
import { NATIVE_MATERIAL_KEY } from './RendererClassifier.js';
import type { NativeModelDef } from './models/NativeModel.js';

/** Prefix of the classifier's model name for a game material (`wgsl:<name>`). */
export const GAME_MATERIAL_PREFIX = 'wgsl:';

const registry = new Map<string, NativeModelDef>();

/**
 * Registers the WGSL of a game material. The `def` is a regular native model: its `wgsl()` has a
 * `vs(vin : VIn)` that builds the position from `nativeLocal(vin)` (instance and skin applied) and
 * `view.time` (the shader clock, see `ShaderClock.ts`), and an `fs`. Its own vertex attributes go in
 * `attributeTypes` (an `InstancedBufferAttribute` of the geometry is per instance).
 *
 * @param name - The value of `material.userData.nativeMaterial`.
 * @param def - The model; its `name` is ignored (the registry names it `wgsl:<name>`).
 * @example
 * registerNativeMaterial('sea', seaModel);
 * seaMaterial.userData.nativeMaterial = 'sea';
 */
export function registerNativeMaterial(name: string, def: NativeModelDef): void {
  // A view of `def` with the registry's name (methods of a class instance stay on the prototype).
  const named = Object.create(def, { name: { value: GAME_MATERIAL_PREFIX + name } }) as NativeModelDef;
  registry.set(named.name, named);
}

/** The registered model for a classifier name (`wgsl:<name>`), or `undefined`. */
export function gameMaterialModel(model: string): NativeModelDef | undefined {
  return registry.get(model);
}

/** `userData` key of a material that names its game WGSL (re-exported for the games). */
export const NATIVE_MATERIAL_USERDATA = NATIVE_MATERIAL_KEY;
