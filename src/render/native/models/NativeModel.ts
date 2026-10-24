/**
 * The contract of a fixed model of the native renderer (ADR-0465 §3, SPEC-0495 §4): what the
 * server needs from a model to draw a material with its own WGSL. Each model lives in its own
 * file under `models/` and is listed in `models/index.ts` — the seam that lets the R1 fronts add
 * models in parallel without touching each other's files.
 *
 * Split of responsibilities (so fronts do not collide):
 * - the MODEL owns the material shading features (`map`, `fog`, `normalMap`, `emissiveMap`,
 *   `alphaTest`, `instanceColor`, `receiveShadow`, …) and its params block;
 * - the CORE (`NativeRenderer.ts` + `coreWgsl` below) owns the object/pipeline features
 *   (`instanced`, `skinned`, `transparent`, `additive`, `noDepthWrite`, `polygonOffset`,
 *   `renderOrder`, `doubleSide`) and the vertex input: a model's `vs` takes `vin : VIn` and builds
 *   its position as the three does — `(view.view * nativeModel(vin)) * nativeLocal(vin)` — and its
 *   normal from `nativeNormalMatrix(vin) * nativeLocalNormal(vin)`, so instancing and skinning
 *   are added in the core without touching the models.
 *
 * Bind groups are fixed (SPEC-0475): 0 = view block, 1 = frame blocks (lights, shadow — see
 * `frame/`), 2 = material (params UBO + sampler/texture pair per map slot), 3 = object block.
 */
import type { Material, Object3D } from 'three';
import type { Classification } from '../RendererClassifier.js';

/** Vertex attributes a model can read; locations follow the order the model returns. */
export type VertexSemantic = 'position' | 'normal' | 'uv' | 'color';

export interface NativeModelDef {
  /** Name the classifier gives (`unlit`, `lambert`, …, or `wgsl:<game material>`). */
  readonly name: string;
  /**
   * Variant key for the MATERIAL features (the core already removed and checked the
   * object/pipeline ones), or `null` = refused (the three keeps the object).
   */
  variant(c: Classification & { kind: 'covered' }, object: Object3D, material: Material): string[] | null;
  /** Vertex attributes the variant reads, in location order (`position` first). */
  attributes(variant: readonly string[]): readonly VertexSemantic[];
  /** WGSL of the variant: a `vs(vin : VIn) -> …` and an `fs`, against `coreWgsl`. */
  wgsl(variant: readonly string[]): string;
  /** Floats of the material params block (a multiple of 4: std140 rows); starts with the color rgb. */
  readonly paramFloats: number;
  /** Writes the material params into `out` (the snapshot that detects a change, too). */
  writeParams(material: Material, out: Float32Array): void;
  /** Textures bound in group 2 after the params UBO, one sampler + texture pair each. */
  textures(material: Material, variant: readonly string[]): readonly unknown[];
}

/** Floats of the view block (two mat4 + vec3 + 2 floats, padded to a 16-byte multiple). */
export const VIEW_FLOATS = 40;
/** Floats of the object block: model mat4 + normal mat3 (three std140 rows). */
export const OBJECT_FLOATS = 28;
/** Where the normal matrix rows start in the object block. */
export const OBJECT_NORMAL_AT = 16;

const WGSL_TYPE: Record<VertexSemantic, string> = {
  position: 'vec3<f32>',
  normal: 'vec3<f32>',
  uv: 'vec2<f32>',
  // vec4 from a 3-component attribute reads alpha = 1 (WebGPU fills missing components).
  color: 'vec4<f32>',
};

/**
 * Core WGSL every model is compiled with: view block, object block, the vertex input struct
 * `VIn` for the model's attributes, and the world-space helpers. `frameWgsl` is the WGSL of the
 * frame blocks (group 1), appended by the server.
 */
export function coreWgsl(semantics: readonly VertexSemantic[], frameWgsl = ''): string {
  const inputs = semantics.map((s, loc) => `  @location(${loc}) ${s} : ${WGSL_TYPE[s]},`).join('\n');
  const normal = semantics.includes('normal')
    ? `/** Local normal of the vertex (the core adds skinning here). */
fn nativeLocalNormal(vin : VIn) -> vec3<f32> {
  return vin.normal;
}`
    : '';
  return /* wgsl */ `
struct View {
  projection : mat4x4<f32>,
  view : mat4x4<f32>,
  fogColor : vec3<f32>,
  fogNear : f32,
  fogFar : f32,
};
@group(0) @binding(0) var<uniform> view : View;

struct ObjectBlock {
  model : mat4x4<f32>,
  normalMatrix : mat3x3<f32>,
};
@group(3) @binding(0) var<uniform> object : ObjectBlock;

struct VIn {
${inputs}
  @builtin(instance_index) instance : u32,
};

/** Model matrix of this vertex's instance (the core adds instancing here). */
fn nativeModel(vin : VIn) -> mat4x4<f32> {
  return object.model;
}

/** Normal matrix (inverse transpose of the model's 3x3, computed in double on the CPU like the three). */
fn nativeNormalMatrix(vin : VIn) -> mat3x3<f32> {
  return object.normalMatrix;
}

/** Local position of the vertex (the core adds skinning here). */
fn nativeLocal(vin : VIn) -> vec4<f32> {
  return vec4<f32>(vin.position, 1.0);
}
${normal}
${frameWgsl}
`;
}
