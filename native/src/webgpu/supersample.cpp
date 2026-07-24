#include "supersample.h"

#include <cstddef>
#include <cstdio>

#include "bloom.h"

namespace webgpu {
namespace {

// Recursos de blit — criados uma vez (device é estável durante a sessão).
WGPURenderPipeline g_pipeline = nullptr;
WGPUBindGroupLayout g_bindLayout = nullptr;
WGPUSampler g_sampler = nullptr;
WGPUTextureFormat g_pipelineFormat = WGPUTextureFormat_Undefined;
// Formato com que o offscreen ATUAL foi criado. Ligar/desligar o bloom troca o
// formato (LDR ↔ HDR), então ele entra na condição de recriação.
WGPUTextureFormat g_offscreenFormat = WGPUTextureFormat_Undefined;
// Caminho HDR (bloom nativo, ADR-0147) — pipeline/layout próprios: o bind group
// ganha a textura do bloom e um uniform com os parâmetros do composite.
WGPURenderPipeline g_hdrPipeline = nullptr;
WGPUBindGroupLayout g_hdrBindLayout = nullptr;
WGPUTextureFormat g_hdrPipelineFormat = WGPUTextureFormat_Undefined;
WGPUBuffer g_hdrUniform = nullptr;

// Uniform do composite HDR (2×vec4 = 32 B, alinhado).
struct HdrParams {
  float strength;
  float exposure;
  float vignetteIntensity;
  float vignetteInner;
  float vignetteOuter;
  float pad0;
  float pad1;
  float pad2;
};
// Textura 1×1 transparente pra o binding da UI quando NÃO há UI neste frame
// (WebGPU exige o binding preenchido; a=0 → composição passa o jogo direto).
WGPUTexture g_emptyUi = nullptr;
WGPUTextureView g_emptyUiView = nullptr;

// Fullscreen triangle que amostra o offscreen (sampler linear = box filter no
// downscale) e COMPÕE a UI EM GAMA por cima (ADR-0105). O offscreen guarda bytes
// sRGB (formato non-srgb); a UI vem de uma RenderTarget do three em LINEAR
// premultiplicado. Compor no espaço sRGB do jogo = blend em gama, igual ao DOM:
//   out = game_srgb·(1−a) + OETF(ui_rgb / a)·a
// OETF(ui/a) recupera a cor sRGB autorada (opaco fica bit-exato). UV com Y
// invertido (espaço de textura); os dois alvos são RTs do three → mesma orientação.
const char* kBlitShader = R"WGSL(
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
  let game = textureSample(src, samp, in.uv).rgb;   // bytes sRGB do jogo
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
const char* kHdrBlitShader = R"WGSL(
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
  let scene = textureSample(src, samp, in.uv).rgb;
  // Ganho de composição da pirâmide dual-filter (o three soma 5 mips ponderados;
  // o dual-filter tem ganho ~1). Calibrado com o bloom no PADRÃO DE MERCADO —
  // threshold ~1.0, só o que é HDR de propósito (material.intensity > 1) vira
  // glow, ver ADR-0149. Enquanto o Studio usa o BloomNode do three e o export
  // usa este dual-filter, este ganho aproxima os dois; quando o Studio passar a
  // usar o MESMO dual-filter, ele deixa de precisar existir.
  const BLOOM_GAIN : f32 = 0.75;
  let bloomC = textureSample(bloomTex, samp, in.uv).rgb * BLOOM_GAIN;
  var hdr = scene + bloomC * params.strength;

  if (params.vigIntensity > 0.0) {
    let d = length(in.uv - vec2f(0.5, 0.5));
    let t = clamp((d - params.vigInner) / max(params.vigOuter - params.vigInner, 1e-4), 0.0, 1.0);
    let falloff = 1.0 - t * t * (3.0 - 2.0 * t);  // smoothstep invertido
    hdr = hdr * mix(1.0, falloff, params.vigIntensity);
  }

  let game = oetf(acesFilmic(hdr, params.exposure));      // HDR → sRGB (bytes)
  let ui = textureSample(uiTex, samp, in.uv);
  var outc = game;
  if (ui.a > 0.0) {
    let ui_srgb = oetf(ui.rgb / ui.a);
    outc = game * (1.0 - ui.a) + ui_srgb * ui.a;          // blend em gama (= CSS)
  }
  return vec4f(outc, 1.0);
}
)WGSL";

// Textura 1×1 transparente (a=0), criada uma vez, pro binding da UI "vazia".
WGPUTextureView ensureEmptyUi(HostGpu* gpu) {
  if (g_emptyUiView) return g_emptyUiView;
  WGPUTextureDescriptor td = WGPU_TEXTURE_DESCRIPTOR_INIT;
  td.size = {1, 1, 1};
  td.format = WGPUTextureFormat_RGBA8Unorm;
  td.usage = WGPUTextureUsage_TextureBinding | WGPUTextureUsage_CopyDst;
  td.dimension = WGPUTextureDimension_2D;
  g_emptyUi = wgpuDeviceCreateTexture(gpu->device, &td);
  const uint8_t zero[4] = {0, 0, 0, 0};
  WGPUTexelCopyTextureInfo dst = WGPU_TEXEL_COPY_TEXTURE_INFO_INIT;
  dst.texture = g_emptyUi;
  WGPUTexelCopyBufferLayout layout = WGPU_TEXEL_COPY_BUFFER_LAYOUT_INIT;
  layout.bytesPerRow = 4;
  layout.rowsPerImage = 1;
  WGPUExtent3D ext = {1, 1, 1};
  wgpuQueueWriteTexture(gpu->queue, &dst, zero, 4, &layout, &ext);
  g_emptyUiView = wgpuTextureCreateView(g_emptyUi, nullptr);
  return g_emptyUiView;
}

/** Sampler linear do blit. Compartilhado pelos DOIS pipelines (LDR e HDR) — o
 *  composite com bloom também o usa no bind group, então não pode nascer só
 *  dentro do `ensurePipeline`. */
void ensureSampler(HostGpu* gpu) {
  if (g_sampler) return;
  WGPUSamplerDescriptor sd = WGPU_SAMPLER_DESCRIPTOR_INIT;
  sd.magFilter = WGPUFilterMode_Linear;
  sd.minFilter = WGPUFilterMode_Linear;
  sd.addressModeU = WGPUAddressMode_ClampToEdge;
  sd.addressModeV = WGPUAddressMode_ClampToEdge;
  g_sampler = wgpuDeviceCreateSampler(gpu->device, &sd);
}

void ensurePipeline(HostGpu* gpu, WGPUTextureFormat targetFormat) {
  if (g_pipeline && g_pipelineFormat == targetFormat) return;
  if (g_pipeline) {
    wgpuRenderPipelineRelease(g_pipeline);
    g_pipeline = nullptr;
  }
  ensureSampler(gpu);
  if (!g_bindLayout) {
    WGPUBindGroupLayoutEntry entries[3] = {};
    entries[0] = WGPU_BIND_GROUP_LAYOUT_ENTRY_INIT;
    entries[0].binding = 0;
    entries[0].visibility = WGPUShaderStage_Fragment;
    entries[0].texture.sampleType = WGPUTextureSampleType_Float;
    entries[0].texture.viewDimension = WGPUTextureViewDimension_2D;
    entries[1] = WGPU_BIND_GROUP_LAYOUT_ENTRY_INIT;
    entries[1].binding = 1;
    entries[1].visibility = WGPUShaderStage_Fragment;
    entries[1].sampler.type = WGPUSamplerBindingType_Filtering;
    entries[2] = WGPU_BIND_GROUP_LAYOUT_ENTRY_INIT;  // textura da UI (ADR-0105)
    entries[2].binding = 2;
    entries[2].visibility = WGPUShaderStage_Fragment;
    entries[2].texture.sampleType = WGPUTextureSampleType_Float;
    entries[2].texture.viewDimension = WGPUTextureViewDimension_2D;
    WGPUBindGroupLayoutDescriptor ld = WGPU_BIND_GROUP_LAYOUT_DESCRIPTOR_INIT;
    ld.entryCount = 3;
    ld.entries = entries;
    g_bindLayout = wgpuDeviceCreateBindGroupLayout(gpu->device, &ld);
  }

  WGPUShaderSourceWGSL wgsl = WGPU_SHADER_SOURCE_WGSL_INIT;
  wgsl.code = {kBlitShader, WGPU_STRLEN};
  WGPUShaderModuleDescriptor smd = WGPU_SHADER_MODULE_DESCRIPTOR_INIT;
  smd.nextInChain = &wgsl.chain;
  WGPUShaderModule module = wgpuDeviceCreateShaderModule(gpu->device, &smd);

  WGPUPipelineLayoutDescriptor pld = WGPU_PIPELINE_LAYOUT_DESCRIPTOR_INIT;
  pld.bindGroupLayoutCount = 1;
  pld.bindGroupLayouts = &g_bindLayout;
  WGPUPipelineLayout layout =
      wgpuDeviceCreatePipelineLayout(gpu->device, &pld);

  WGPUColorTargetState target = WGPU_COLOR_TARGET_STATE_INIT;
  target.format = targetFormat;
  WGPUFragmentState fragment = WGPU_FRAGMENT_STATE_INIT;
  fragment.module = module;
  fragment.entryPoint = {"fs", WGPU_STRLEN};
  fragment.targetCount = 1;
  fragment.targets = &target;

  WGPURenderPipelineDescriptor pd = WGPU_RENDER_PIPELINE_DESCRIPTOR_INIT;
  pd.layout = layout;
  pd.vertex.module = module;
  pd.vertex.entryPoint = {"vs", WGPU_STRLEN};
  pd.primitive.topology = WGPUPrimitiveTopology_TriangleList;
  pd.fragment = &fragment;
  g_pipeline = wgpuDeviceCreateRenderPipeline(gpu->device, &pd);
  g_pipelineFormat = targetFormat;

  wgpuPipelineLayoutRelease(layout);
  wgpuShaderModuleRelease(module);
}

/** Pipeline do composite HDR (bloom nativo). Espelha `ensurePipeline`, com dois
 *  bindings a mais: a textura do bloom e o uniform dos parâmetros. */
void ensureHdrPipeline(HostGpu* gpu, WGPUTextureFormat targetFormat) {
  if (g_hdrPipeline && g_hdrPipelineFormat == targetFormat) return;
  if (g_hdrPipeline) {
    wgpuRenderPipelineRelease(g_hdrPipeline);
    g_hdrPipeline = nullptr;
  }
  ensureSampler(gpu);  // o bind group do composite também usa (bind 1)
  if (!g_hdrUniform) {
    WGPUBufferDescriptor bd = WGPU_BUFFER_DESCRIPTOR_INIT;
    bd.size = sizeof(HdrParams);
    bd.usage = WGPUBufferUsage_Uniform | WGPUBufferUsage_CopyDst;
    g_hdrUniform = wgpuDeviceCreateBuffer(gpu->device, &bd);
  }
  if (!g_hdrBindLayout) {
    WGPUBindGroupLayoutEntry entries[5] = {};
    for (int i = 0; i < 5; i++) {
      entries[i] = WGPU_BIND_GROUP_LAYOUT_ENTRY_INIT;
      entries[i].binding = static_cast<uint32_t>(i);
      entries[i].visibility = WGPUShaderStage_Fragment;
    }
    entries[0].texture.sampleType = WGPUTextureSampleType_Float;  // cena HDR
    entries[0].texture.viewDimension = WGPUTextureViewDimension_2D;
    entries[1].sampler.type = WGPUSamplerBindingType_Filtering;
    entries[2].texture.sampleType = WGPUTextureSampleType_Float;  // UI
    entries[2].texture.viewDimension = WGPUTextureViewDimension_2D;
    entries[3].texture.sampleType = WGPUTextureSampleType_Float;  // bloom
    entries[3].texture.viewDimension = WGPUTextureViewDimension_2D;
    entries[4].buffer.type = WGPUBufferBindingType_Uniform;
    entries[4].buffer.minBindingSize = sizeof(HdrParams);
    WGPUBindGroupLayoutDescriptor ld = WGPU_BIND_GROUP_LAYOUT_DESCRIPTOR_INIT;
    ld.entryCount = 5;
    ld.entries = entries;
    g_hdrBindLayout = wgpuDeviceCreateBindGroupLayout(gpu->device, &ld);
  }

  WGPUShaderSourceWGSL wgsl = WGPU_SHADER_SOURCE_WGSL_INIT;
  wgsl.code = {kHdrBlitShader, WGPU_STRLEN};
  WGPUShaderModuleDescriptor smd = WGPU_SHADER_MODULE_DESCRIPTOR_INIT;
  smd.nextInChain = &wgsl.chain;
  WGPUShaderModule module = wgpuDeviceCreateShaderModule(gpu->device, &smd);

  WGPUPipelineLayoutDescriptor pld = WGPU_PIPELINE_LAYOUT_DESCRIPTOR_INIT;
  pld.bindGroupLayoutCount = 1;
  pld.bindGroupLayouts = &g_hdrBindLayout;
  WGPUPipelineLayout layout = wgpuDeviceCreatePipelineLayout(gpu->device, &pld);

  WGPUColorTargetState target = WGPU_COLOR_TARGET_STATE_INIT;
  target.format = targetFormat;
  WGPUFragmentState fragment = WGPU_FRAGMENT_STATE_INIT;
  fragment.module = module;
  fragment.entryPoint = {"fs", WGPU_STRLEN};
  fragment.targetCount = 1;
  fragment.targets = &target;

  WGPURenderPipelineDescriptor pd = WGPU_RENDER_PIPELINE_DESCRIPTOR_INIT;
  pd.layout = layout;
  pd.vertex.module = module;
  pd.vertex.entryPoint = {"vs", WGPU_STRLEN};
  pd.primitive.topology = WGPUPrimitiveTopology_TriangleList;
  pd.fragment = &fragment;
  g_hdrPipeline = wgpuDeviceCreateRenderPipeline(gpu->device, &pd);
  g_hdrPipelineFormat = targetFormat;

  wgpuPipelineLayoutRelease(layout);
  wgpuShaderModuleRelease(module);
}

}  // namespace

WGPUTextureView ensureOffscreen(HostGpu* gpu) {
  if (!gpu->device) return nullptr;
  // Sem SSAA E sem compositor de UI → render direto na swapchain (sem offscreen).
  // Com compositor de UI (ADR-0105), FORÇA o offscreen mesmo em renderScale=1,
  // pra o passe de composição rodar (não dá pra ler+escrever a swapchain).
  if (gpu->renderScale <= 1.0f && !gpu->uiCompositor) return nullptr;
  const float scale = gpu->renderScale > 1.0f ? gpu->renderScale : 1.0f;
  const int w = static_cast<int>(gpu->width * scale);
  const int h = static_cast<int>(gpu->height * scale);
  if (w <= 0 || h <= 0) return nullptr;

  // ⚠️ O formato do offscreen é DO JS, não nosso. O three monta os render
  // pipelines com o formato que ele configurou na canvas (`context.configure`),
  // e o offscreen é o que o `getCurrentTexture` devolve: trocar pra RGBA16Float
  // aqui dá "pipeline targets are incompatible with render pass" e o wgpu
  // PANICA. É por isso que o bloom nativo trabalha em LDR, sobre a imagem já
  // tonemapeada pelo JS (ADR-0147) — mudar isso exige mover a configuração da
  // canvas junto, não só o formato daqui.
  const WGPUTextureFormat wanted = gpu->requestedFormat;

  if (gpu->offscreenTexture && gpu->offscreenWidth == w &&
      gpu->offscreenHeight == h && g_offscreenFormat == wanted) {
    return gpu->offscreenView;
  }
  if (gpu->offscreenView) wgpuTextureViewRelease(gpu->offscreenView);
  if (gpu->offscreenTexture) wgpuTextureRelease(gpu->offscreenTexture);
  // O tamanho/formato mudou: a pirâmide do bloom aponta pra a view antiga.
  destroyBloom();

  WGPUTextureDescriptor td = WGPU_TEXTURE_DESCRIPTOR_INIT;
  td.size = {static_cast<uint32_t>(w), static_cast<uint32_t>(h), 1};
  td.format = wanted;
  td.usage =
      WGPUTextureUsage_RenderAttachment | WGPUTextureUsage_TextureBinding;
  td.dimension = WGPUTextureDimension_2D;
  gpu->offscreenTexture = wgpuDeviceCreateTexture(gpu->device, &td);
  gpu->offscreenView = wgpuTextureCreateView(gpu->offscreenTexture, nullptr);
  gpu->offscreenWidth = w;
  gpu->offscreenHeight = h;
  g_offscreenFormat = wanted;
  return gpu->offscreenView;
}

void clearOffscreen(HostGpu* gpu) {
  if (!gpu->offscreenView) return;
  WGPURenderPassColorAttachment att = WGPU_RENDER_PASS_COLOR_ATTACHMENT_INIT;
  att.view = gpu->offscreenView;
  att.loadOp = WGPULoadOp_Clear;
  att.storeOp = WGPUStoreOp_Store;
  att.clearValue = {0, 0, 0, 1};
  WGPURenderPassDescriptor pass = WGPU_RENDER_PASS_DESCRIPTOR_INIT;
  pass.colorAttachmentCount = 1;
  pass.colorAttachments = &att;
  WGPUCommandEncoder enc = wgpuDeviceCreateCommandEncoder(gpu->device, nullptr);
  WGPURenderPassEncoder rp = wgpuCommandEncoderBeginRenderPass(enc, &pass);
  wgpuRenderPassEncoderEnd(rp);
  wgpuRenderPassEncoderRelease(rp);
  WGPUCommandBuffer cmd = wgpuCommandEncoderFinish(enc, nullptr);
  wgpuCommandEncoderRelease(enc);
  wgpuQueueSubmit(gpu->queue, 1, &cmd);
  wgpuCommandBufferRelease(cmd);
}

void blitToSwapchain(HostGpu* gpu, WGPUTextureView swapchainView) {
  // Fonte da CENA: com bloom HDR (ADR-0149) é a RenderTarget que o JS entregou
  // (linear HDR); senão é o offscreen do jogo (LDR, já tonemapeado). No caminho
  // HDR o offscreen do host nem é usado.
  WGPUTextureView sceneView = nullptr;
  bool ownSceneView = false;
  int sceneW = gpu->offscreenWidth;
  int sceneH = gpu->offscreenHeight;
  const bool hdr = gpu->bloom.enabled && gpu->sceneHdrTexture != nullptr;
  if (hdr) {
    sceneView = wgpuTextureCreateView(gpu->sceneHdrTexture, nullptr);
    ownSceneView = true;
    // A RT do JS tem o tamanho do drawing buffer (nativo × dpr) = o do offscreen.
  } else {
    if (!gpu->offscreenView) return;
    sceneView = gpu->offscreenView;
  }

  // Bloom em HDR ANTES do composite: a pirâmide roda sobre a cena linear e o
  // composite soma + ACES. É acender em HDR que dá a paridade com o Studio.
  WGPUTextureView bloomView = nullptr;
  if (hdr) {
    renderBloom(gpu, sceneView, sceneW, sceneH);
    bloomView = bloomResultView();
  }
  const bool composite = hdr && bloomView != nullptr;
  if (composite) {
    ensureHdrPipeline(gpu, gpu->requestedFormat);
    HdrParams p{};
    p.strength = gpu->bloom.strength;
    p.exposure = gpu->bloom.exposure;
    p.vignetteIntensity = gpu->bloom.vignette ? gpu->bloom.vignetteIntensity : 0.0f;
    p.vignetteInner = gpu->bloom.vignetteInner;
    p.vignetteOuter = gpu->bloom.vignetteOuter;
    wgpuQueueWriteBuffer(gpu->queue, g_hdrUniform, 0, &p, sizeof(p));
  } else {
    // Sem bloom: blit LDR normal (downscale do offscreen + UI em gama).
    if (ownSceneView) wgpuTextureViewRelease(sceneView);
    if (!gpu->offscreenView) return;
    sceneView = gpu->offscreenView;
    ownSceneView = false;
    ensurePipeline(gpu, gpu->requestedFormat);
  }

  // UI do frame (ADR-0105): a textura da RT do three ou a 1×1 transparente. View
  // criada aqui e liberada no fim (a RT pode ser recriada no resize do JS).
  WGPUTextureView uiView = nullptr;
  bool ownUiView = false;
  if (gpu->uiTexture) {
    uiView = wgpuTextureCreateView(gpu->uiTexture, nullptr);
    ownUiView = true;
  } else {
    uiView = ensureEmptyUi(gpu);
  }

  WGPUBindGroupEntry bg[5] = {};
  for (int i = 0; i < 5; i++) {
    bg[i] = WGPU_BIND_GROUP_ENTRY_INIT;
    bg[i].binding = static_cast<uint32_t>(i);
  }
  bg[0].textureView = sceneView;
  bg[1].sampler = g_sampler;
  bg[2].textureView = uiView;
  if (composite) {
    bg[3].textureView = bloomView;
    bg[4].buffer = g_hdrUniform;
    bg[4].size = sizeof(HdrParams);
  }
  WGPUBindGroupDescriptor bgd = WGPU_BIND_GROUP_DESCRIPTOR_INIT;
  bgd.layout = composite ? g_hdrBindLayout : g_bindLayout;
  bgd.entryCount = composite ? 5 : 3;
  bgd.entries = bg;
  WGPUBindGroup bindGroup = wgpuDeviceCreateBindGroup(gpu->device, &bgd);

  WGPURenderPassColorAttachment att = WGPU_RENDER_PASS_COLOR_ATTACHMENT_INIT;
  att.view = swapchainView;
  att.loadOp = WGPULoadOp_Clear;
  att.storeOp = WGPUStoreOp_Store;
  att.clearValue = {0, 0, 0, 1};
  WGPURenderPassDescriptor pass = WGPU_RENDER_PASS_DESCRIPTOR_INIT;
  pass.colorAttachmentCount = 1;
  pass.colorAttachments = &att;

  WGPUCommandEncoder encoder =
      wgpuDeviceCreateCommandEncoder(gpu->device, nullptr);
  WGPURenderPassEncoder rp = wgpuCommandEncoderBeginRenderPass(encoder, &pass);
  wgpuRenderPassEncoderSetPipeline(rp, composite ? g_hdrPipeline : g_pipeline);
  wgpuRenderPassEncoderSetBindGroup(rp, 0, bindGroup, 0, nullptr);
  wgpuRenderPassEncoderDraw(rp, 3, 1, 0, 0);
  wgpuRenderPassEncoderEnd(rp);
  wgpuRenderPassEncoderRelease(rp);
  WGPUCommandBuffer cmd = wgpuCommandEncoderFinish(encoder, nullptr);
  wgpuCommandEncoderRelease(encoder);
  wgpuQueueSubmit(gpu->queue, 1, &cmd);
  wgpuCommandBufferRelease(cmd);
  wgpuBindGroupRelease(bindGroup);
  if (ownUiView) wgpuTextureViewRelease(uiView);
  if (ownSceneView) wgpuTextureViewRelease(sceneView);
}

}  // namespace webgpu
