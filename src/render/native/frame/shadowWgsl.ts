/**
 * WGSL do bloco de sombra do sol (SPEC-0545, SPEC-0690, SPEC-0732), gerado para o número de cascatas em uso.
 *
 * - Cada mapa `k` tem a sua `nativeShadowTap{k}` e a sua `nativeShadowPcf{k}`, com a textura escrita no código: nada
 *   de `switch` por leitura. O mapa único (SPEC-0545) e a cascata 0 dividem o binding 10 e a `nativeShadowPcf0`.
 * - O `nativeShadowCsm` sai desenrolado, um bloco por cascata, com uma chamada só a `nativeShadowCascade{k}`: a mesma
 *   conta do `_setupFade`/`_setupStandard` do three (three 0.184), na mesma ordem (paridade em `csmCascadeMath.ts`).
 * - O UBO continua com as `CSM_MAX_CASCADES` cascatas: só o código encolhe.
 */
import { CSM_FIRST_MAP_BINDING, CSM_MAX_CASCADES, CSM_STRUCT_WGSL } from './shadowCsm.js';
import { SHADOW_FIRST_BINDING } from './shadowLayout.js';

export const SHADOW_PARAMS_BINDING = SHADOW_FIRST_BINDING;
export const SHADOW_SAMPLER_BINDING = SHADOW_FIRST_BINDING + 1;
export const SHADOW_MAP_BINDING = CSM_FIRST_MAP_BINDING;
/** Leituras do PCFSoft do three (bilinear 3×3); o divisor da soma. */
const PCF_SOFT_TAPS = 9;

/** Nome da textura do mapa `k` (o 0 é o mapa único / cascata 0). */
function mapName(k: number): string {
  return k === 0 ? 'nativeShadowMap' : `nativeShadowMap${k}`;
}

/** Tap e PCFSoft do mapa `k`, já misturado pela intensidade da sombra. */
function pcfWgsl(k: number): string {
  const tap = `nativeShadowTap${k}`;
  return /* wgsl */ `
/** Uma leitura de comparação do mapa ${k} (variante Level: sem regra de uniformidade). */
fn ${tap}(uv : vec2<f32>, z : f32) -> f32 {
  return textureSampleCompareLevel(${mapName(k)}, nativeShadowSampler, uv, z);
}

/** PCFSoft do mapa ${k}, já misturado pela intensidade da sombra. */
fn nativeShadowPcf${k}(positionWorld : vec3<f32>, normalWorld : vec3<f32>, matrix : mat4x4<f32>, normalBias : f32, bias : f32) -> f32 {
  let clip = matrix * vec4<f32>(positionWorld + normalWorld * normalBias, 1.0);
  let ndc = clip.xyz / clip.w;
  var uv = vec2<f32>(ndc.x, 1.0 - ndc.y);
  let z = ndc.z + bias;
  if (!(uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0 && z <= 1.0)) {
    return 1.0;
  }
  let mapSize = nativeShadowParams.mapSize;
  uv = uv + nativeShadowParams.uvShift;
  let texel = vec2<f32>(1.0) / mapSize;
  let f = fract(uv * mapSize + vec2<f32>(0.5));
  uv = uv - f * texel;
  let dx = texel.x;
  let dy = texel.y;
  let sum = ${tap}(uv, z)
    + ${tap}(uv + vec2<f32>(dx, 0.0), z)
    + ${tap}(uv + vec2<f32>(0.0, dy), z)
    + ${tap}(uv + texel, z)
    + mix(${tap}(uv + vec2<f32>(-dx, 0.0), z), ${tap}(uv + vec2<f32>(dx * 2.0, 0.0), z), f.x)
    + mix(${tap}(uv + vec2<f32>(-dx, dy), z), ${tap}(uv + vec2<f32>(dx * 2.0, dy), z), f.x)
    + mix(${tap}(uv + vec2<f32>(0.0, -dy), z), ${tap}(uv + vec2<f32>(0.0, dy * 2.0), z), f.y)
    + mix(${tap}(uv + vec2<f32>(dx, -dy), z), ${tap}(uv + vec2<f32>(dx, dy * 2.0), z), f.y)
    + mix(
        mix(${tap}(uv + vec2<f32>(-dx, -dy), z), ${tap}(uv + vec2<f32>(dx * 2.0, -dy), z), f.x),
        mix(${tap}(uv + vec2<f32>(-dx, dy * 2.0), z), ${tap}(uv + vec2<f32>(dx * 2.0, dy * 2.0), z), f.x),
        f.y);
  return mix(1.0, sum * (1.0 / ${PCF_SOFT_TAPS}.0), nativeShadowParams.intensity);
}
`;
}

/** Fator da cascata `k` (intensidade incluída); a cascata recusada fica em luz. */
function cascadeWgsl(k: number): string {
  return /* wgsl */ `
fn nativeShadowCascade${k}(positionWorld : vec3<f32>, normalWorld : vec3<f32>) -> f32 {
  let c = nativeShadowParams.cascades[${k}];
  if (c.bias.z == 0.0) {
    return 1.0;
  }
  return nativeShadowPcf${k}(positionWorld, normalWorld, c.matrix, c.bias.y, c.bias.x);
}
`;
}

/** O bloco da cascata `k` dentro do `nativeShadowCsm`: faixa (sem fade) ou margem da emenda (com fade). */
function csmStepWgsl(k: number): string {
  // A primeira cascata não esmaece na borda de perto.
  const first = k === 0 ? `
        ratio = select(1.0, ratio, linearDepth > cascadeCenter);` : '';
  return /* wgsl */ `
  if (${k}u < count) {
    let cascade = nativeShadowParams.cascades[${k}].range;
    var inside = linearDepth >= cascade.x && linearDepth <= cascade.y;
    var ratio = 1.0;
    if (fade) {
      let cascadeCenter = (cascade.x + cascade.y) / 2.0;
      let closestEdge = select(cascade.y, cascade.x, linearDepth < cascadeCenter);
      // closestEdge.pow(2.0) do three; o produto evita pow(0, 2), que alguns drivers devolvem como NaN.
      let margin = 0.25 * (closestEdge * closestEdge);
      let csmX = cascade.x - margin / 2.0;
      var csmY = cascade.y + margin / 2.0;
      if (${k}u == count - 1u) {
        csmY = cascade.y;
      }
      inside = linearDepth >= csmX && linearDepth <= csmY;
      if (inside) {
        let dist = min(linearDepth - csmX, csmY - linearDepth);
        ratio = clamp(dist / margin, 0.0, 1.0);${first}
      }
    }
    if (inside) {
      let factor = nativeShadowCascade${k}(positionWorld, normalWorld);
      ret = select(factor, ret - (1.0 - factor) * ratio, fade);
    }
  }`;
}

/**
 * Os mapas 1..N-1, o fator por cascata e o `nativeShadowCsm` para `cascades` cascatas (`''` com 0).
 *
 * @param cascades - Cascatas que o shader lê, de 0 a `CSM_MAX_CASCADES`.
 */
export function csmWgsl(cascades: number): string {
  const n = Math.min(Math.max(cascades, 0), CSM_MAX_CASCADES);
  if (n === 0) return '';
  const indices = Array.from({ length: n }, (_, k) => k);
  const maps = indices
    .slice(1)
    .map((k) => `@group(1) @binding(${CSM_FIRST_MAP_BINDING + k}) var ${mapName(k)} : texture_depth_2d;`)
    .join('\n');
  return /* wgsl */ `
${maps}
${indices.slice(1).map(pcfWgsl).join('')}
${indices.map(cascadeWgsl).join('')}
/** O CSMShadowNode do three: _setupFade com fade, _setupStandard sem; 1 além da última cascata. */
fn nativeShadowCsm(positionWorld : vec3<f32>, normalWorld : vec3<f32>, positionView : vec3<f32>) -> f32 {
  let g = nativeShadowParams.csm;
  let linearDepth = (positionView.z + g.x) / (g.x - g.y);
  let count = min(u32(g.z), ${n}u);
  let fade = g.w != 0.0;
  var ret = 1.0;${indices.map(csmStepWgsl).join('')}
  return ret;
}
`;
}

/**
 * WGSL do bloco inteiro: o UBO, o sampler, o mapa 0, o PCFSoft de cada mapa em uso, a CSM e o `nativeShadow`.
 *
 * @param cascades - Cascatas compiladas (0 = só o mapa único).
 */
export function shadowWgsl(cascades: number): string {
  const csm = csmWgsl(cascades);
  const csmBranch = csm === '' ? '' : `
  if (nativeShadowParams.csm.z > 0.0) {
    return nativeShadowCsm(positionWorld, normalWorld, positionView);
  }`;
  return /* wgsl */ `${CSM_STRUCT_WGSL}
struct NativeShadowParams {
  matrix : mat4x4<f32>,
  normalBias : f32,
  bias : f32,
  mapSize : vec2<f32>,
  intensity : f32,
  enabled : f32,
  uvShift : vec2<f32>,
  csm : vec4<f32>,
  cascades : array<NativeShadowCascade, ${CSM_MAX_CASCADES}>,
};
@group(1) @binding(${SHADOW_PARAMS_BINDING}) var<uniform> nativeShadowParams : NativeShadowParams;
@group(1) @binding(${SHADOW_SAMPLER_BINDING}) var nativeShadowSampler : sampler_comparison;
@group(1) @binding(${SHADOW_MAP_BINDING}) var nativeShadowMap : texture_depth_2d;
${pcfWgsl(0)}${csm}
/** Fator da sombra do sol (0 = sombra, 1 = luz), já misturado pela intensidade; multiplica só o termo direto do sol. */
fn nativeShadow(positionWorld : vec3<f32>, normalWorld : vec3<f32>, positionView : vec3<f32>) -> f32 {
  if (nativeShadowParams.enabled == 0.0) {
    return 1.0;
  }${csmBranch}
  return nativeShadowPcf0(positionWorld, normalWorld, nativeShadowParams.matrix, nativeShadowParams.normalBias, nativeShadowParams.bias);
}
`;
}
