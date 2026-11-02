/**
 * `terrainSplat` (SPEC-0662): the terrain paint material (`buildTerrainSplatMaterial`) in the native
 * renderer, so the terrain stops falling back to the three in JS. Its base color is the splat blend,
 * in the order of the WGSL the three 0.184 generates for it (DDD 00 dump): layers at `uv * repeat`,
 * splat at `uv`, `mix(color, Σ layer·w / max(Σw, 1e-4), clamp(Σw, 0, 1))`, alpha 1. Lighting, shadow
 * and fog are the `standard` model's.
 */
import type { Material, Texture } from 'three';
import type { NativeModelDef } from './NativeModel.js';
import { litAttributes, litVariant } from './lambert.js';
import { STANDARD_PARAM_FLOATS, dfgTexture, standardRefusal, standardWgsl, writeStandardParams } from './standard.js';

/** `userData.nativeMaterial` of the terrain paint material. */
export const TERRAIN_SPLAT_MATERIAL = 'cortexTerrainSplat';

/** The textures and tiling of one terrain material (nodes: their `.value` changes live). */
export interface TerrainSplatSource {
  splat: { value: Texture | null };
  layers: readonly { value: Texture | null }[];
  repeats: readonly { value: number }[];
}

// A WeakMap and not `userData`: the nodes would go into the material's JSON.
const sources = new WeakMap<Material, TerrainSplatSource>();

/** Ties a terrain material to its splat and layers (done by `buildTerrainSplatMaterial`). */
export function setTerrainSplatSource(material: Material, source: TerrainSplatSource): void {
  sources.set(material, source);
}

const REPEAT_AT = STANDARD_PARAM_FLOATS;
const ROW_FLOATS = 4;
const LAYERS = ['layer0', 'layer1', 'layer2', 'layer3'] as const;
/** Features the terrain draws (the classification of its material). */
const ACCEPTED = ['fog', 'alpha', 'receiveShadow'];

const DIFFUSE_WGSL = /* wgsl */ `
  let splat = textureSample(splatTexture, splatSampler, in.uv);
  let layer0 = textureSample(layer0Texture, layer0Sampler, in.uv * vec2<f32>(params.layerRepeat.x));
  let layer1 = textureSample(layer1Texture, layer1Sampler, in.uv * vec2<f32>(params.layerRepeat.y));
  let layer2 = textureSample(layer2Texture, layer2Sampler, in.uv * vec2<f32>(params.layerRepeat.z));
  let layer3 = textureSample(layer3Texture, layer3Sampler, in.uv * vec2<f32>(params.layerRepeat.w));
  let weight = ((splat.x + splat.y) + splat.z) + splat.w;
  let blended = ((((layer0.xyz * vec3<f32>(splat.x)) + (layer1.xyz * vec3<f32>(splat.y))) + (layer2.xyz * vec3<f32>(splat.z))) + (layer3.xyz * vec3<f32>(splat.w))) / vec3<f32>(max(weight, 0.0001));
  var diffuse = vec4<f32>(mix(params.color, blended, clamp(weight, 0.0, 1.0)), 1.0);`;

export const terrainSplatModel: NativeModelDef = {
  name: 'terrainSplat',
  paramFloats: STANDARD_PARAM_FLOATS + ROW_FLOATS,

  variant(c, object, material) {
    if (!sources.has(material) || standardRefusal(object, material) !== null) return null;
    const v = litVariant(c, material, ACCEPTED);
    return v === null ? null : [...v, 'splat'];
  },

  attributes: litAttributes,

  wgsl: (variant) => standardWgsl(variant, { params: 'layerRepeat : vec4<f32>,', textures: ['splat', ...LAYERS], diffuse: DIFFUSE_WGSL }),

  writeParams(material, out) {
    writeStandardParams(material, out);
    const repeats = sources.get(material)?.repeats ?? [];
    for (let i = 0; i < ROW_FLOATS; i++) out[REPEAT_AT + i] = repeats[i]?.value ?? 1;
  },

  textures(material) {
    const s = sources.get(material)!;
    return [s.splat.value, ...s.layers.map((l) => l.value), dfgTexture()];
  },
};
