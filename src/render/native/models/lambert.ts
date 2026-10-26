/**
 * `lambert` model (R1.2, SPEC-0535): `MeshLambert(Node)Material`, opaque, lit by the lights block
 * (`frame/lights.ts`): sun + hemisphere + up to 8 spots.
 *
 * Math ported from the WGSL the three 0.184 generates for the DDD 61 (R0 reference dump, classes
 * `lambert+fog`, `+emissiveMap+fog+map+vertexColors`, `+alphaTest`, `+doubleSide`):
 * `diffuse = vec4(color, 1) * map(uvTransform * uv) * vertexColor`, `a *= opacity`, discard when
 * `a <= alphaTest`, `a = 1`; `emissive = vec4(emissive * intensity, 1) * emissiveMap(its own
 * uvTransform)`; direct = sun + spots, `saturate(dot(N, L)) * lightColor * diffuse / PI`; indirect
 * = hemisphere irradiance `* diffuse / PI`; `max(vec4(direct + indirect + emissive, a), 0)`, then
 * linear fog. Output is linear (the three's output pass applies sRGB to the frame).
 *
 * The parts shared with `standard` (params, vertex stage, surface, fog) are exported from here.
 */
import type { Material, Object3D, Texture } from 'three';
import type { Classification } from '../RendererClassifier.js';
import { lightsRefusal } from '../frame/lights.js';
import { SHADOW_READY } from '../frame/shadow.js';
import type { NativeModelDef, VertexSemantic } from './NativeModel.js';

/** three constants (kept local). */
const BACK_SIDE = 1;
const DOUBLE_SIDE = 2;

const ROW_FLOATS = 4;
const MAT3_COLUMNS = 3;
/** Params rows: color+opacity, emissive+alphaTest, map uv transform (3), emissiveMap uv transform (3). */
export const LIT_PARAM_FLOATS = 8 * ROW_FLOATS;
const OPACITY_AT = 3;
const EMISSIVE_AT = ROW_FLOATS;
const ALPHA_TEST_AT = ROW_FLOATS + 3;
const MAP_TRANSFORM_AT = 2 * ROW_FLOATS;
const EMISSIVE_TRANSFORM_AT = 5 * ROW_FLOATS;

/** Lit models draw receiveShadow objects (with `nativeShadow`) only once this is on. */
const RECEIVE_SHADOW = true;

/** Shading features both lit models take from the classification. */
const LIT_FEATURES = ['map', 'emissiveMap', 'vertexColors', 'instanceColor', 'fog', 'alpha', 'alphaTest', 'receiveShadow'] as const;
/** Accepted without a variant of their own (the uv transform is always applied). */
const NEUTRAL_FEATURES = ['uvTransform', 'noToneMap'];

type MapLike = Texture & { matrix: { elements: ArrayLike<number> }; matrixAutoUpdate: boolean; updateMatrix(): void };

export interface LitMaterial {
  color: { r: number; g: number; b: number };
  opacity: number;
  emissive: { r: number; g: number; b: number };
  emissiveIntensity: number;
  alphaTest: number;
  alphaToCoverage?: boolean;
  side: number;
  map: MapLike | null;
  emissiveMap: MapLike | null;
}

/**
 * Variant of a lit model, or `null` = refused: unknown feature, `receiveShadow` before the shadow
 * block is ready, `BackSide`, alpha to coverage, or lights the block cannot reproduce.
 */
/**
 * Why a lit model refuses a material (`null` = it draws it): a feature outside `accepted`,
 * `receiveShadow` while the shadow is off, `BackSide`, alpha to coverage, or lights the block
 * cannot reproduce. The census records it per object (SPEC-0535).
 */
export function litRefusal(c: Classification & { kind: 'covered' }, material: Material, accepted: readonly string[]): string | null {
  const m = material as unknown as LitMaterial;
  for (const f of c.features) {
    if (!accepted.includes(f) && !NEUTRAL_FEATURES.includes(f)) return `feature:${f}`;
  }
  // RECEIVE_SHADOW is the switch for native receivers (the 6/255 shadow-edge gap was the C++ map,
  // fixed by drawing it in the three's float order — SPEC-0545).
  if (c.features.includes('receiveShadow') && !(SHADOW_READY && RECEIVE_SHADOW)) return 'receiveShadow';
  if (m.side === BACK_SIDE) return 'backSide';
  if (m.alphaToCoverage) return 'alphaToCoverage';
  return lightsRefusal();
}

/**
 * Refusals the lit models made, counted when they happen (`model:reason|material` → n): the core
 * caches a refusal, so a transient reason is only visible here. The census records it.
 */
export const litRefusalCounts = new Map<string, number>();

/** Variant of a lit model, or `null` = refused (`litRefusal` says why, counted in `litRefusalCounts`). */
export function litVariant(c: Classification & { kind: 'covered' }, material: Material, accepted: readonly string[]): string[] | null {
  const why = litRefusal(c, material, accepted);
  if (why !== null) {
    const key = `${c.model}:${why}|${material.name || material.type}`;
    litRefusalCounts.set(key, (litRefusalCounts.get(key) ?? 0) + 1);
    return null;
  }
  const variant: string[] = accepted.filter((f) => c.features.includes(f));
  if ((material as unknown as LitMaterial).side === DOUBLE_SIDE) variant.push('doubleSide');
  return variant;
}

export function litAttributes(variant: readonly string[]): VertexSemantic[] {
  const out: VertexSemantic[] = ['position', 'normal'];
  if (variant.includes('map') || variant.includes('emissiveMap')) out.push('uv');
  if (variant.includes('vertexColors')) out.push('color');
  if (variant.includes('instanceColor')) out.push('instanceColor');
  return out;
}

/** The textures of a lit variant in binding order (map, emissiveMap), before any model extra. */
export function litTextures(material: Material, variant: readonly string[]): unknown[] {
  const m = material as unknown as LitMaterial;
  const out: unknown[] = [];
  if (variant.includes('map')) out.push(m.map);
  if (variant.includes('emissiveMap')) out.push(m.emissiveMap);
  return out;
}

function writeUvTransform(out: Float32Array, at: number, map: MapLike | null): void {
  if (!map) {
    out.fill(0, at, at + MAT3_COLUMNS * ROW_FLOATS);
    return;
  }
  if (map.matrixAutoUpdate) map.updateMatrix();
  const e = map.matrix.elements;
  for (let col = 0; col < MAT3_COLUMNS; col++) {
    const row = at + col * ROW_FLOATS;
    out[row] = e[col * MAT3_COLUMNS]!;
    out[row + 1] = e[col * MAT3_COLUMNS + 1]!;
    out[row + 2] = e[col * MAT3_COLUMNS + 2]!;
    out[row + 3] = 0;
  }
}

/** Writes the params rows shared by the lit models (the first LIT_PARAM_FLOATS floats). */
export function writeLitParams(material: Material, out: Float32Array): void {
  const m = material as unknown as LitMaterial;
  out[0] = m.color.r;
  out[1] = m.color.g;
  out[2] = m.color.b;
  out[OPACITY_AT] = m.opacity;
  out[EMISSIVE_AT] = m.emissive.r * m.emissiveIntensity;
  out[EMISSIVE_AT + 1] = m.emissive.g * m.emissiveIntensity;
  out[EMISSIVE_AT + 2] = m.emissive.b * m.emissiveIntensity;
  out[ALPHA_TEST_AT] = m.alphaTest;
  writeUvTransform(out, MAP_TRANSFORM_AT, m.map);
  writeUvTransform(out, EMISSIVE_TRANSFORM_AT, m.emissiveMap);
}

/**
 * Params struct, group-2 textures, vertex output and vertex stage of a lit variant.
 * `extraParams` are fields appended to `Params`; `extraTextures` names textures bound after the
 * lit ones (one sampler + texture pair each, `<name>Sampler` / `<name>Texture`).
 */
export function litVertexWgsl(variant: readonly string[], extraParams = '', extraTextures: readonly string[] = []): string {
  const has = (f: string) => variant.includes(f);
  const uv = has('map') || has('emissiveMap');
  const names = [...(has('map') ? ['map'] : []), ...(has('emissiveMap') ? ['emissive'] : []), ...extraTextures];
  const bindings = names
    .map((n, i) => `@group(2) @binding(${1 + 2 * i}) var ${n}Sampler : sampler;\n@group(2) @binding(${2 + 2 * i}) var ${n}Texture : texture_2d<f32>;`)
    .join('\n');
  return /* wgsl */ `
const RECIPROCAL_PI = 0.3183098861837907;

struct Params {
  color : vec3<f32>,
  opacity : f32,
  emissive : vec3<f32>,
  alphaTest : f32,
  mapTransform : mat3x3<f32>,
  emissiveMapTransform : mat3x3<f32>,
  ${extraParams}
};
@group(2) @binding(0) var<uniform> params : Params;
${bindings}

struct VOut {
  @builtin(position) @invariant clip : vec4<f32>,
  @location(0) positionView : vec3<f32>,
  @location(1) normalView : vec3<f32>,
  ${uv ? '@location(2) uv : vec2<f32>,' : ''}
  ${has('vertexColors') ? '@location(3) color : vec4<f32>,' : ''}
  ${has('receiveShadow') ? '@location(4) positionWorld : vec3<f32>,' : ''}
  ${has('instanceColor') ? '@location(5) instanceColor : vec3<f32>,' : ''}
};

@vertex
fn vs(vin : VIn) -> VOut {
  var out : VOut;
  out.normalView = normalize((view.view * vec4<f32>(nativeNormalMatrix(vin) * nativeLocalNormal(vin), 0.0)).xyz);
  let modelView = view.view * nativeModel(vin);
  out.positionView = (modelView * nativeLocal(vin)).xyz;
  out.clip = view.projection * vec4<f32>(out.positionView, 1.0);
  ${uv ? 'out.uv = vin.uv;' : ''}
  ${has('vertexColors') ? 'out.color = vin.color;' : ''}
  ${has('receiveShadow') ? 'out.positionWorld = (nativeModel(vin) * nativeLocal(vin)).xyz;' : ''}
  ${has('instanceColor') ? 'out.instanceColor = vin.instanceColor;' : ''}
  return out;
}
`;
}

/**
 * Fragment prologue shared by the lit models: `diffuse` (rgb + alpha 1 after the alpha test),
 * `emissive`, `normalGeometry` (before the face flip) and `normal`, `sunColor` (with the sun
 * shadow when the variant receives it).
 */
export function litSurfaceWgsl(variant: readonly string[]): string {
  const has = (f: string) => variant.includes(f);
  return /* wgsl */ `
  var diffuse = vec4<f32>(params.color, 1.0);
  ${has('map') ? 'diffuse = diffuse * textureSample(mapTexture, mapSampler, (params.mapTransform * vec3<f32>(in.uv, 1.0)).xy);' : ''}
  ${has('vertexColors') ? 'diffuse = diffuse * in.color;' : ''}
  ${has('instanceColor') ? 'diffuse = vec4<f32>(in.instanceColor, 1.0) * diffuse;' : ''}
  diffuse.w = diffuse.w * params.opacity;
  ${has('alphaTest') ? 'if (diffuse.w <= params.alphaTest) {\n    discard;\n  }' : ''}
  ${has('alpha') ? '' : 'diffuse.w = 1.0;'}
  var emissive = params.emissive;
  ${has('emissiveMap') ? 'emissive = (vec4<f32>(params.emissive, 1.0) * textureSample(emissiveTexture, emissiveSampler, (params.emissiveMapTransform * vec3<f32>(in.uv, 1.0)).xy)).xyz;' : ''}
  let normalGeometry = normalize(in.normalView);
  var normal = normalGeometry;
  ${has('doubleSide') ? 'normal = normalGeometry * vec3<f32>((f32(isFront) * 2.0) - 1.0);' : ''}
  var sunColor = lights.sunColor;
  ${has('receiveShadow') ? 'sunColor = sunColor * nativeShadow(in.positionWorld, normalize((vec4<f32>(normal, 0.0) * view.view).xyz));' : ''}
  let sunDirection = nativeSunDirection();
`;
}

/** Fragment epilogue: output with alpha, clamp, linear fog. */
export function litOutputWgsl(variant: readonly string[]): string {
  return /* wgsl */ `
  var color = max(vec4<f32>(outgoingLight + emissive, diffuse.w), vec4<f32>(0.0));
  ${variant.includes('fog') ? 'color = vec4<f32>(mix(color.xyz, view.fogColor, smoothstep(view.fogNear, view.fogFar, -in.positionView.z)), color.w);' : ''}
  return color;
`;
}

/** Material features the lambert model draws (the census reads it too). */
export const LAMBERT_ACCEPTED: readonly string[] = LIT_FEATURES;
const ACCEPTED = LAMBERT_ACCEPTED;

export const lambertModel: NativeModelDef = {
  name: 'lambert',
  paramFloats: LIT_PARAM_FLOATS,

  variant(c, _object: Object3D, material) {
    return litVariant(c, material, ACCEPTED);
  },

  attributes: litAttributes,

  wgsl(variant) {
    return /* wgsl */ `${litVertexWgsl(variant)}
@fragment
fn fs(in : VOut, @builtin(front_facing) isFront : bool) -> @location(0) vec4<f32> {
${litSurfaceWgsl(variant)}
  let reflectance = diffuse.xyz * vec3<f32>(RECIPROCAL_PI);
  var directDiffuse = (vec3<f32>(clamp(dot(normal, sunDirection), 0.0, 1.0)) * sunColor) * reflectance;
  let irradiance = nativeHemiIrradiance(normal);
  var spotDiffuse = vec3<f32>(0.0);
  for (var i = 0u; i < lights.spotCount; i++) {
    let spot = nativeSpot(i, in.positionView);
    spotDiffuse = spotDiffuse + ((vec3<f32>(clamp(dot(normal, spot.direction), 0.0, 1.0)) * spot.color) * (diffuse.xyz * vec3<f32>(RECIPROCAL_PI)));
  }
  directDiffuse = directDiffuse + spotDiffuse;
  let indirectDiffuse = irradiance * (diffuse.xyz * vec3<f32>(RECIPROCAL_PI));
  let outgoingLight = directDiffuse + indirectDiffuse;
${litOutputWgsl(variant)}
}
`;
  },

  writeParams: writeLitParams,

  textures: litTextures,
};
