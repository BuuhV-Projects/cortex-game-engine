/**
 * `unlit` model (R1.1, SPEC-0495): `MeshBasic(Node)Material`, opaque.
 *
 * Math ported from the WGSL the three 0.184 generates for the DDD 61's basic materials
 * (R0 reference dump, SPEC-0505): `positionView = (view * model) * position`,
 * `clip = projection * positionView`; `diffuse = color * map(uvTransform * uv) * vertexColor`,
 * alpha forced to 1 (opaque), `max(…, 0)`, then linear fog `smoothstep(near, far, -z)`. The
 * output is linear: the three's output pass applies the sRGB transfer to the whole frame. The
 * hemisphere/spot loops the three emits for basic materials are dead code (their result never
 * reaches the output) and are left out.
 */
import type { Material, Texture } from 'three';
import type { NativeModelDef } from './NativeModel.js';

/** Features this model draws; any other covered feature is a refusal (a later stage's). */
const ACCEPTED = new Set(['map', 'vertexColors', 'fog', 'uvTransform', 'receiveShadow', 'noToneMap']);
const VARIANT_FEATURES = ['map', 'vertexColors', 'fog'] as const;

/** color.rgb + opacity, then the uv transform as three std140 rows. */
const PARAM_FLOATS = 16;
const UV_TRANSFORM_AT = 4;
const MAT3_COLUMNS = 3;
const ROW_FLOATS = 4;

interface BasicLike {
  color: { r: number; g: number; b: number };
  opacity: number;
  map: (Texture & { matrix: { elements: ArrayLike<number> }; matrixAutoUpdate: boolean }) | null;
}

export const unlitModel: NativeModelDef = {
  name: 'unlit',
  paramFloats: PARAM_FLOATS,

  variant(c) {
    for (const f of c.features) if (!ACCEPTED.has(f)) return null;
    return VARIANT_FEATURES.filter((f) => c.features.includes(f));
  },

  attributes(variant) {
    const out: Array<'position' | 'uv' | 'color'> = ['position'];
    if (variant.includes('map')) out.push('uv');
    if (variant.includes('vertexColors')) out.push('color');
    return out;
  },

  wgsl(variant) {
    const map = variant.includes('map');
    const vc = variant.includes('vertexColors');
    const fog = variant.includes('fog');
    return `
struct Params {
  color : vec3<f32>,
  opacity : f32,
  uvTransform : mat3x3<f32>,
};
@group(2) @binding(0) var<uniform> params : Params;
${map ? '@group(2) @binding(1) var mapSampler : sampler;\n@group(2) @binding(2) var mapTexture : texture_2d<f32>;' : ''}

struct VOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) positionView : vec3<f32>,
  ${map ? '@location(1) uv : vec2<f32>,' : ''}
  ${vc ? '@location(2) color : vec4<f32>,' : ''}
};

@vertex
fn vs(vin : VIn) -> VOut {
  var out : VOut;
  let modelView = view.view * nativeModel(vin);
  out.positionView = (modelView * nativeLocal(vin)).xyz;
  out.clip = view.projection * vec4<f32>(out.positionView, 1.0);
  ${map ? 'out.uv = vin.uv;' : ''}
  ${vc ? 'out.color = vin.color;' : ''}
  return out;
}

@fragment
fn fs(in : VOut) -> @location(0) vec4<f32> {
  var diffuse = vec4<f32>(params.color, 1.0);
  ${map ? 'diffuse = diffuse * textureSample(mapTexture, mapSampler, (params.uvTransform * vec3<f32>(in.uv, 1.0)).xy);' : ''}
  ${vc ? 'diffuse = diffuse * in.color;' : ''}
  diffuse.w = 1.0;
  var color = max(diffuse, vec4<f32>(0.0));
  ${fog ? 'color = vec4<f32>(mix(color.xyz, view.fogColor, smoothstep(view.fogNear, view.fogFar, -in.positionView.z)), color.w);' : ''}
  return color;
}
`;
  },

  writeParams(material: Material, out: Float32Array): void {
    const m = material as unknown as BasicLike;
    out[0] = m.color.r;
    out[1] = m.color.g;
    out[2] = m.color.b;
    out[3] = m.opacity;
    const map = m.map;
    if (map) {
      if (map.matrixAutoUpdate) (map as unknown as { updateMatrix(): void }).updateMatrix();
      const e = map.matrix.elements;
      for (let col = 0; col < MAT3_COLUMNS; col++) {
        const at = UV_TRANSFORM_AT + col * ROW_FLOATS;
        out[at] = e[col * MAT3_COLUMNS]!;
        out[at + 1] = e[col * MAT3_COLUMNS + 1]!;
        out[at + 2] = e[col * MAT3_COLUMNS + 2]!;
        out[at + 3] = 0;
      }
    } else {
      out.fill(0, UV_TRANSFORM_AT);
    }
  },

  textures(material, variant) {
    return variant.includes('map') ? [(material as unknown as BasicLike).map] : [];
  },
};
