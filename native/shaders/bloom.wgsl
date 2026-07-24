// ⚠️ FONTE ÚNICA DA APARÊNCIA DO BLOOM (ADR-0147).
//
// Este arquivo é consumido pelos DOIS backends:
//  - host nativo (C++): virado no header `bloom_wgsl.h` pelo CMake (`configure_file`)
//    e compilado direto pelo wgpu/naga;
//  - browser/Studio (JS): lido como texto e usado via `wgslFn` do TSL.
//
// A ORQUESTRAÇÃO (criar pipeline, alocar mips, encodar as passadas) é
// necessariamente diferente nos dois — é justamente ela que sai do JS pra matar o
// custo de travessia NAPI. Mas a MATEMÁTICA, que é o que faria a imagem divergir,
// mora só aqui. Ao mexer no visual do bloom, mexa NESTE arquivo.
//
// Algoritmo: dual filter (downsample 13-tap + upsample tent 9-tap), o mesmo do
// Call of Duty AW / Unity URP. Escolhido em vez do gaussiano separável do
// `UnrealBloomPass` do three porque dá uma passada por nível em vez de duas, com
// halo mais macio e sem o serrilhado do box.

struct VOut {
  @builtin(position) pos : vec4f,
  @location(0) uv : vec2f,
};

// Triângulo fullscreen (sem vertex buffer). UV com Y invertido = espaço de
// textura, igual ao blit da UI (ADR-0105).
@vertex
fn vs(@builtin(vertex_index) i : u32) -> VOut {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var out : VOut;
  out.pos = vec4f(p[i], 0.0, 1.0);
  out.uv = vec2f((p[i].x + 1.0) * 0.5, 1.0 - (p[i].y + 1.0) * 0.5);
  return out;
}

// ── Parâmetros por passada ────────────────────────────────────────────────────
// `texel` = 1/tamanho da TEXTURA DE ORIGEM (o raio dos taps acompanha o nível).
// `param` = threshold no bright pass, raio do tent no upsample.
struct BloomParams {
  texel : vec2f,
  threshold : f32,
  param : f32,
};

@group(0) @binding(0) var src : texture_2d<f32>;
@group(0) @binding(1) var samp : sampler;
@group(0) @binding(2) var<uniform> params : BloomParams;

/**
 * Luminância perceptual (Rec. 709) — o mesmo peso que o `luminance()` do three,
 * pra o corte do bright pass cair nos mesmos pixels dos dois lados.
 */
fn luma(c : vec3f) -> f32 {
  return dot(c, vec3f(0.2126, 0.7152, 0.0722));
}

/**
 * sRGB → linear (EOTF). O offscreen guarda a cena JÁ TONEMAPEADA em bytes sRGB
 * (o formato da canvas é do JS — ver a nota no `ensureOffscreen`), então o corte
 * e o blur precisam acontecer em LINEAR: somar em gama escurece o halo e suja a
 * cor das bordas.
 */
fn eotf(c : vec3f) -> vec3f {
  let lo = c / 12.92;
  let hi = pow((c + 0.055) / 1.055, vec3f(2.4));
  return select(hi, lo, c <= vec3f(0.04045));
}

/**
 * Corte de brilho com JOELHO SUAVE. O corte duro (`step`) faz a borda do bloom
 * "piscar" quando um pixel cruza o limiar com a câmera em movimento; a rampa
 * quadrática no joelho (meia oitava abaixo do threshold) elimina isso.
 */
fn brightPass(c : vec3f, threshold : f32) -> vec3f {
  let knee = max(threshold * 0.5, 1e-4);
  let l = luma(c);
  let soft = clamp(l - threshold + knee, 0.0, 2.0 * knee);
  let contrib = max(l - threshold, soft * soft / (4.0 * knee + 1e-6));
  return c * (contrib / max(l, 1e-4));
}

@fragment
fn fsBright(in : VOut) -> @location(0) vec4f {
  // Decodifica pra linear ANTES de cortar: a fonte é sRGB tonemapeado.
  let c = eotf(textureSample(src, samp, in.uv).rgb);
  return vec4f(brightPass(c, params.threshold), 1.0);
}

/**
 * Downsample 13-tap ("dual filter"): 4 taps no centro com peso alto + um anel de
 * 3×3. Amostrar 13 pontos em vez de 4 é o que impede o cintilar de pixels
 * isolados muito brilhantes quando a pirâmide desce.
 */
@fragment
fn fsDown(in : VOut) -> @location(0) vec4f {
  let t = params.texel;
  let uv = in.uv;
  let a = textureSample(src, samp, uv + vec2f(-2.0 * t.x,  2.0 * t.y)).rgb;
  let b = textureSample(src, samp, uv + vec2f( 0.0,        2.0 * t.y)).rgb;
  let c = textureSample(src, samp, uv + vec2f( 2.0 * t.x,  2.0 * t.y)).rgb;
  let d = textureSample(src, samp, uv + vec2f(-2.0 * t.x,  0.0)).rgb;
  let e = textureSample(src, samp, uv).rgb;
  let f = textureSample(src, samp, uv + vec2f( 2.0 * t.x,  0.0)).rgb;
  let g = textureSample(src, samp, uv + vec2f(-2.0 * t.x, -2.0 * t.y)).rgb;
  let h = textureSample(src, samp, uv + vec2f( 0.0,       -2.0 * t.y)).rgb;
  let i = textureSample(src, samp, uv + vec2f( 2.0 * t.x, -2.0 * t.y)).rgb;
  let j = textureSample(src, samp, uv + vec2f(-t.x,  t.y)).rgb;
  let k = textureSample(src, samp, uv + vec2f( t.x,  t.y)).rgb;
  let l = textureSample(src, samp, uv + vec2f(-t.x, -t.y)).rgb;
  let m = textureSample(src, samp, uv + vec2f( t.x, -t.y)).rgb;
  var o = (j + k + l + m) * 0.5;
  o = o + (a + b + d + e) * 0.125;
  o = o + (b + c + e + f) * 0.125;
  o = o + (d + e + g + h) * 0.125;
  o = o + (e + f + h + i) * 0.125;
  return vec4f(o * 0.25, 1.0);
}

/**
 * Upsample com filtro TENT 3×3. Somado (blend aditivo no pipeline) ao nível de
 * cima: é a soma dos níveis que dá o halo largo do bloom. `param` = raio, o
 * mesmo papel do `radius` do three.
 */
@fragment
fn fsUp(in : VOut) -> @location(0) vec4f {
  let t = params.texel * params.param;
  let uv = in.uv;
  var o = textureSample(src, samp, uv + vec2f(-t.x,  t.y)).rgb * 1.0;
  o = o + textureSample(src, samp, uv + vec2f( 0.0,  t.y)).rgb * 2.0;
  o = o + textureSample(src, samp, uv + vec2f( t.x,  t.y)).rgb * 1.0;
  o = o + textureSample(src, samp, uv + vec2f(-t.x,  0.0)).rgb * 2.0;
  o = o + textureSample(src, samp, uv).rgb                     * 4.0;
  o = o + textureSample(src, samp, uv + vec2f( t.x,  0.0)).rgb * 2.0;
  o = o + textureSample(src, samp, uv + vec2f(-t.x, -t.y)).rgb * 1.0;
  o = o + textureSample(src, samp, uv + vec2f( 0.0, -t.y)).rgb * 2.0;
  o = o + textureSample(src, samp, uv + vec2f( t.x, -t.y)).rgb * 1.0;
  return vec4f(o * (1.0 / 16.0), 1.0);
}
