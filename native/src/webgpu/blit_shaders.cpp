// Shaders WGSL do blit final do host (supersample.cpp): o LDR (offscreen já
// tonemapeado) e o composite HDR (bloom + ACES, ADR-0147/0149). Os dois são
// montados como `kUnderwaterWgsl + shader`: o trecho comum do efeito embaixo
// d'água (SPEC-0726) fica no binding 5 dos dois layouts.
#include "blit_shaders.h"

namespace webgpu {

// Efeito embaixo d'água (SPEC-0726, ADR-0727). Casa com `UnderwaterUniform`
// (underwater_params.h). Com `amount` 0 os dois ramos devolvem a entrada intacta:
// é um ramo UNIFORME (mesmo valor no quadro todo), então a amostra continua em
// controle uniforme e o custo desligado é um teste por pixel.
//   uv'  = (uv.x + sin(fase + uv.y·frequency)·amplitude·amount, uv.y)   (y = 0 no topo)
//   cor' = mix(c, mix(c, água, tint)·brightness, amount)               (em tela, sRGB)
const char* const kUnderwaterWgsl = R"WGSL(
struct Underwater {
  amount : f32,
  tint : f32,
  brightness : f32,
  amplitude : f32,
  frequency : f32,
  phase : f32,
  pad0 : f32,
  pad1 : f32,
  color : vec4f,
};
@group(0) @binding(5) var<uniform> uw : Underwater;

fn underwaterUv(uv : vec2f) -> vec2f {
  if (uw.amount <= 0.0) { return uv; }
  let offset = sin(uw.phase + uv.y * uw.frequency) * uw.amplitude * uw.amount;
  return vec2f(uv.x + offset, uv.y);
}

fn underwaterColor(c : vec3f) -> vec3f {
  if (uw.amount <= 0.0) { return c; }
  let tinted = mix(c, uw.color.rgb, uw.tint) * uw.brightness;
  return mix(c, tinted, uw.amount);
}
)WGSL";

// Fullscreen triangle que amostra o offscreen (sampler linear = box filter no
// downscale) e COMPÕE a UI EM GAMA por cima (ADR-0105). O offscreen guarda bytes
// sRGB (formato non-srgb); a UI vem de uma RenderTarget do three em LINEAR
// premultiplicado. Compor no espaço sRGB do jogo = blend em gama, igual ao DOM:
//   out = game_srgb·(1−a) + OETF(ui_rgb / a)·a
// OETF(ui/a) recupera a cor sRGB autorada (opaco fica bit-exato). UV com Y
// invertido (espaço de textura); os dois alvos são RTs do three → mesma orientação.
const char* const kBlitShader = R"WGSL(
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var uiTex: texture_2d<f32>;

struct VOut {
  @builtin(position) pos : vec4f,
  @location(0) uv : vec2f,
};

@vertex
fn vs(@builtin(vertex_index) i : u32) -> VOut {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var out : VOut;
  out.pos = vec4f(p[i], 0.0, 1.0);
  out.uv = vec2f((p[i].x + 1.0) * 0.5, 1.0 - (p[i].y + 1.0) * 0.5);
  return out;
}

// linear → sRGB (OETF), por canal.
fn oetf(c : vec3f) -> vec3f {
  let cl = max(c, vec3f(0.0));
  let lo = cl * 12.92;
  let hi = 1.055 * pow(cl, vec3f(1.0 / 2.4)) - 0.055;
  return select(hi, lo, cl < vec3f(0.0031308));
}

@fragment
fn fs(in : VOut) -> @location(0) vec4f {
  // Embaixo d'água (SPEC-0726): a cena ondula e é tingida; a UI usa a UV original.
  let game = underwaterColor(textureSample(src, samp, underwaterUv(in.uv)).rgb);  // bytes sRGB
  let ui = textureSample(uiTex, samp, in.uv);       // linear premultiplicado + alpha
  var outc = game;
  if (ui.a > 0.0) {
    let ui_srgb = oetf(ui.rgb / ui.a);              // unpremult → OETF → cor sRGB
    outc = game * (1.0 - ui.a) + ui_srgb * ui.a;    // blend em gama (= CSS)
  }
  return vec4f(outc, 1.0);
}
)WGSL";

// Composite HDR (ADR-0147) — usado quando o bloom nativo está ligado. Aqui o
// offscreen guarda a cena em LINEAR HDR (o JS renderiza com `NoToneMapping`), e
// este passe faz TUDO que o `PostFX` do JS fazia, sem passada extra:
//   cena + bloom·strength → vinheta → exposição+ACES → OETF → compõe a UI em gama
//
// O ACES é a MESMA aproximação do three (`ACESFilmicToneMapping`: matrizes de
// entrada/saída + RRTAndODTFit, com o `/0.6` na exposição). Copiar a fórmula é o
// que mantém a cor idêntica entre o Studio e o export — se o three mudar a dele,
// esta precisa acompanhar.
const char* const kHdrBlitShader = R"WGSL(
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var uiTex: texture_2d<f32>;
@group(0) @binding(3) var bloomTex: texture_2d<f32>;

struct Params {
  strength : f32,
  exposure : f32,
  vigIntensity : f32,
  vigInner : f32,
  vigOuter : f32,
  pad0 : f32,
  pad1 : f32,
  pad2 : f32,
};
@group(0) @binding(4) var<uniform> params : Params;

struct VOut {
  @builtin(position) pos : vec4f,
  @location(0) uv : vec2f,
};

@vertex
fn vs(@builtin(vertex_index) i : u32) -> VOut {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var out : VOut;
  out.pos = vec4f(p[i], 0.0, 1.0);
  out.uv = vec2f((p[i].x + 1.0) * 0.5, 1.0 - (p[i].y + 1.0) * 0.5);
  return out;
}

fn oetf(c : vec3f) -> vec3f {
  let cl = max(c, vec3f(0.0));
  let lo = cl * 12.92;
  let hi = 1.055 * pow(cl, vec3f(1.0 / 2.4)) - 0.055;
  return select(hi, lo, cl < vec3f(0.0031308));
}

// ACES filmic — a MESMA aproximação do three (`ACESFilmicToneMapping`): matrizes
// de entrada/saída + RRTAndODTFit, com o `/0.6` na exposição. Copiar a fórmula é
// o que mantém a cor idêntica entre o Studio e o export.
fn rrtAndOdtFit(v : vec3f) -> vec3f {
  let a = v * (v + 0.0245786) - 0.000090537;
  let b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
fn acesFilmic(colorIn : vec3f, exposure : f32) -> vec3f {
  let inMat = mat3x3f(
    vec3f(0.59719, 0.07600, 0.02840),
    vec3f(0.35458, 0.90834, 0.13383),
    vec3f(0.04823, 0.01566, 0.83777));
  let outMat = mat3x3f(
    vec3f( 1.60475, -0.10208, -0.00327),
    vec3f(-0.53108,  1.10813, -0.07276),
    vec3f(-0.07367, -0.00605,  1.07602));
  var c = colorIn * (exposure / 0.6);
  c = inMat * c;
  c = rrtAndOdtFit(c);
  c = outMat * c;
  return clamp(c, vec3f(0.0), vec3f(1.0));
}

@fragment
fn fs(in : VOut) -> @location(0) vec4f {
  // A cena vem em LINEAR HDR (RenderTarget do JS, ADR-0149): soma o bloom AINDA em
  // HDR (é por isso que o brilho bate com o Studio), aplica vinheta, depois ACES +
  // exposição e OETF. Tudo num passe só — o bloom LDR anterior saía fraco porque o
  // ACES já tinha comprimido a cena antes de ele morder.
  let sceneUv = underwaterUv(in.uv);  // ondulação embaixo d'água (SPEC-0726); a UI usa in.uv
  let scene = textureSample(src, samp, sceneUv).rgb;
  // Ganho de composição da pirâmide dual-filter (o three soma 5 mips ponderados;
  // o dual-filter tem ganho ~1). Calibrado com o bloom no PADRÃO DE MERCADO —
  // threshold ~1.0, só o que é HDR de propósito (material.intensity > 1) vira
  // glow, ver ADR-0149. Enquanto o Studio usa o BloomNode do three e o export
  // usa este dual-filter, este ganho aproxima os dois; quando o Studio passar a
  // usar o MESMO dual-filter, ele deixa de precisar existir.
  const BLOOM_GAIN : f32 = 0.75;
  let bloomC = textureSample(bloomTex, samp, sceneUv).rgb * BLOOM_GAIN;
  var hdr = scene + bloomC * params.strength;

  if (params.vigIntensity > 0.0) {
    let d = length(in.uv - vec2f(0.5, 0.5));
    let t = clamp((d - params.vigInner) / max(params.vigOuter - params.vigInner, 1e-4), 0.0, 1.0);
    let falloff = 1.0 - t * t * (3.0 - 2.0 * t);  // smoothstep invertido
    hdr = hdr * mix(1.0, falloff, params.vigIntensity);
  }

  let game = underwaterColor(oetf(acesFilmic(hdr, params.exposure)));  // HDR → sRGB, tinta em tela
  let ui = textureSample(uiTex, samp, in.uv);
  var outc = game;
  if (ui.a > 0.0) {
    let ui_srgb = oetf(ui.rgb / ui.a);
    outc = game * (1.0 - ui.a) + ui_srgb * ui.a;          // blend em gama (= CSS)
  }
  return vec4f(outc, 1.0);
}
)WGSL";

}  // namespace webgpu
