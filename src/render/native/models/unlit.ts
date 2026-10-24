/**
 * `unlit` model (R1.1, SPEC-0495; alpha, alphaTest and instanceColor R1.4, SPEC-0555):
 * `MeshBasic(Node)Material`.
 *
 * Math ported from the WGSL the three 0.184 generates for the DDD 61's basic materials
 * (R0 reference dump, SPEC-0505): `positionView = (view * model) * position`,
 * `clip = projection * positionView`; `diffuse = color * map(uvTransform * uv) * vertexColor`,
 * then `vec4(instanceColor, 1) * diffuse`, `alpha *= opacity`, `alphaTest` discards `alpha <=
 * alphaTest`, alpha forced to 1 unless the core asked for `alpha` (not opaque), `max(…, 0)`, then
 * linear fog `smoothstep(near, far, -z)` on the rgb. The
 * output is linear: the three's output pass applies the sRGB transfer to the whole frame. The
 * hemisphere/spot loops the three emits for basic materials are dead code (their result never
 * reaches the output) and are left out.
 */
import type { Material, Texture } from 'three';
import type { NativeModelDef } from './NativeModel.js';

/** Features this model draws; any other covered feature is a refusal (a later stage's). */
const ACCEPTED = new Set(['map', 'vertexColors', 'fog', 'uvTransform', 'receiveShadow', 'noToneMap', 'alpha', 'alphaTest', 'instanceColor']);
const VARIANT_FEATURES = ['map', 'vertexColors', 'fog', 'alpha', 'alphaTest', 'instanceColor'] as const;

/** color.rgb + opacity, the uv transform as three std140 rows, then alphaTest (one more row). */
const PARAM_FLOATS = 20;
const UV_TRANSFORM_AT = 4;
const ALPHA_TEST_AT = 16;
const MAT3_COLUMNS = 3;
const ROW_FLOATS = 4;

interface BasicLike {
  color: { r: number; g: number; b: number };
  opacity: number;
  alphaTest: number;
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
    const out: Array<'position' | 'uv' | 'color' | 'instanceColor'> = ['position'];
    if (variant.includes('map')) out.push('uv');
    if (variant.includes('vertexColors')) out.push('color');
    if (variant.includes('instanceColor')) out.push('instanceColor');
    return out;
  },

  wgsl(variant) {
    const map = variant.includes('map');
    const vc = variant.includes('vertexColors');
    const fog = variant.includes('fog');
    const alpha = variant.includes('alpha');
    const alphaTest = variant.includes('alphaTest');
    const ic = variant.includes('instanceColor');
    return `
struct Params {
  color : vec3<f32>,
  opacity : f32,
  uvTransform : mat3x3<f32>,
  alphaTest : f32,
};
@group(2) @binding(0) var<uniform> params : Params;
${map ? '@group(2) @binding(1) var mapSampler : sampler;\n@group(2) @binding(2) var mapTexture : texture_2d<f32>;' : ''}

struct VOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) positionView : vec3<f32>,
  ${map ? '@location(1) uv : vec2<f32>,' : ''}
  ${vc ? '@location(2) color : vec4<f32>,' : ''}
  ${ic ? '@location(3) instanceColor : vec3<f32>,' : ''}
};

@vertex
fn vs(vin : VIn) -> VOut {
  var out : VOut;
  let modelView = view.view * nativeModel(vin);
  out.positionView = (modelView * nativeLocal(vin)).xyz;
  out.clip = view.projection * vec4<f32>(out.positionView, 1.0);
  ${map ? 'out.uv = vin.uv;' : ''}
  ${vc ? 'out.color = vin.color;' : ''}
  ${ic ? 'out.instanceColor = vin.instanceColor;' : ''}
  return out;
}

@fragment
fn fs(in : VOut) -> @location(0) vec4<f32> {
  var diffuse = vec4<f32>(params.color, 1.0);
  ${map ? 'diffuse = diffuse * textureSample(mapTexture, mapSampler, (params.uvTransform * vec3<f32>(in.uv, 1.0)).xy);' : ''}
  ${vc ? 'diffuse = diffuse * in.color;' : ''}
  ${ic ? 'diffuse = vec4<f32>(in.instanceColor, 1.0) * diffuse;' : ''}
  diffuse.w = diffuse.w * params.opacity;
  ${alphaTest ? 'if (diffuse.w <= params.alphaTest) { discard; }' : ''}
  ${alpha ? '' : 'diffuse.w = 1.0;'}
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
      out.fill(0, UV_TRANSFORM_AT, ALPHA_TEST_AT);
    }
    out[ALPHA_TEST_AT] = m.alphaTest;
  },

  textures(material, variant) {
    return variant.includes('map') ? [(material as unknown as BasicLike).map] : [];
  },
};
