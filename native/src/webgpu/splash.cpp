#include "splash.h"

#include <stb_image.h>

#include "../brand/splash_png.h"
#include "internal.h"

namespace webgpu {
namespace {

// Ritmo da splash. Total ≈ 1,9 s — tempo de a marca registrar sem irritar.
constexpr double kFadeInMs = 350.0;
constexpr double kHoldMs = 1100.0;
constexpr double kFadeOutMs = 450.0;
constexpr double kTotalMs = kFadeInMs + kHoldMs + kFadeOutMs;

// A marca ocupa no máximo esta fração da janela (o menor dos dois manda, pra
// não estourar em telas ultrawide nem em janelas baixas).
constexpr float kMaxWidthFrac = 0.55f;
constexpr float kMaxHeightFrac = 0.32f;

// Fundo = bg-deep do tema cortex-dark (#0d0e14). Valores JÁ em gama: a
// swapchain é BGRA8Unorm (não-sRGB), então o byte gravado é o byte exibido.
const char* kSplashShader = R"WGSL(
struct U { rect : vec4f, params : vec4f };
@group(0) @binding(0) var tex : texture_2d<f32>;
@group(0) @binding(1) var samp : sampler;
@group(0) @binding(2) var<uniform> u : U;

struct VOut { @builtin(position) pos : vec4f, @location(0) uv : vec2f };

@vertex
fn vs(@builtin(vertex_index) i : u32) -> VOut {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var o : VOut;
  o.pos = vec4f(p[i], 0.0, 1.0);
  o.uv = p[i] * vec2f(0.5, -0.5) + vec2f(0.5, 0.5);
  return o;
}

const BG = vec3f(0.051, 0.055, 0.078);

@fragment
fn fs(in : VOut) -> @location(0) vec4f {
  let r = u.rect;
  let luv = (in.uv - r.xy) / (r.zw - r.xy);
  // Amostra SEMPRE (fora de fluxo não-uniforme); o `inside` mascara o resto.
  let logo = textureSample(tex, samp, clamp(luv, vec2f(0.0), vec2f(1.0)));
  let inside = select(0.0, 1.0, all(luv >= vec2f(0.0)) && all(luv <= vec2f(1.0)));
  // Blend em GAMA (mesmo critério do ADR-0105): a arte foi autorada em sRGB.
  let col = mix(BG, logo.rgb, logo.a * inside * u.params.x);
  return vec4f(col, 1.0);
}
)WGSL";

WGPUTexture g_tex = nullptr;
WGPUTextureView g_view = nullptr;
WGPUSampler g_sampler = nullptr;
WGPUBuffer g_uniform = nullptr;
WGPUBindGroupLayout g_bindLayout = nullptr;
WGPURenderPipeline g_pipeline = nullptr;
WGPUTextureFormat g_pipelineFormat = WGPUTextureFormat_Undefined;

int g_logoW = 0;
int g_logoH = 0;
double g_startMs = -1.0;  // primeiro frame COM device
bool g_finished = false;
bool g_failed = false;  // decode/GPU falhou → nunca mais tenta (jogo não trava)

/** Decodifica o PNG embutido e sobe pra GPU. Uma vez. */
bool ensureTexture(HostGpu* gpu) {
  if (g_tex) return true;
  int channels = 0;
  stbi_uc* pixels = stbi_load_from_memory(brand::kSplashPng,
                                          static_cast<int>(brand::kSplashPng_len),
                                          &g_logoW, &g_logoH, &channels, 4);
  if (!pixels) return false;

  WGPUTextureDescriptor td = WGPU_TEXTURE_DESCRIPTOR_INIT;
  td.dimension = WGPUTextureDimension_2D;
  td.size = {static_cast<uint32_t>(g_logoW), static_cast<uint32_t>(g_logoH), 1};
  td.format = WGPUTextureFormat_RGBA8Unorm;
  td.usage = WGPUTextureUsage_CopyDst | WGPUTextureUsage_TextureBinding;
  td.mipLevelCount = 1;
  td.sampleCount = 1;
  g_tex = wgpuDeviceCreateTexture(gpu->device, &td);
  if (!g_tex) {
    stbi_image_free(pixels);
    return false;
  }

  WGPUTexelCopyTextureInfo dst = WGPU_TEXEL_COPY_TEXTURE_INFO_INIT;
  dst.texture = g_tex;
  dst.mipLevel = 0;
  dst.origin = {0, 0, 0};
  dst.aspect = WGPUTextureAspect_All;
  WGPUTexelCopyBufferLayout layout = WGPU_TEXEL_COPY_BUFFER_LAYOUT_INIT;
  layout.offset = 0;
  layout.bytesPerRow = static_cast<uint32_t>(g_logoW) * 4;
  layout.rowsPerImage = static_cast<uint32_t>(g_logoH);
  WGPUExtent3D extent = {static_cast<uint32_t>(g_logoW),
                         static_cast<uint32_t>(g_logoH), 1};
  wgpuQueueWriteTexture(gpu->queue, &dst, pixels,
                        static_cast<size_t>(g_logoW) * g_logoH * 4, &layout,
                        &extent);
  stbi_image_free(pixels);

  g_view = wgpuTextureCreateView(g_tex, nullptr);
  return g_view != nullptr;
}

bool ensurePipeline(HostGpu* gpu, WGPUTextureFormat targetFormat) {
  if (g_pipeline && g_pipelineFormat == targetFormat) return true;
  if (g_pipeline) {
    wgpuRenderPipelineRelease(g_pipeline);
    g_pipeline = nullptr;
  }
  if (!g_sampler) {
    WGPUSamplerDescriptor sd = WGPU_SAMPLER_DESCRIPTOR_INIT;
    sd.magFilter = WGPUFilterMode_Linear;
    sd.minFilter = WGPUFilterMode_Linear;
    sd.addressModeU = WGPUAddressMode_ClampToEdge;
    sd.addressModeV = WGPUAddressMode_ClampToEdge;
    g_sampler = wgpuDeviceCreateSampler(gpu->device, &sd);
  }
  if (!g_uniform) {
    WGPUBufferDescriptor bd = WGPU_BUFFER_DESCRIPTOR_INIT;
    bd.size = 32;  // vec4 rect + vec4 params
    bd.usage = WGPUBufferUsage_Uniform | WGPUBufferUsage_CopyDst;
    g_uniform = wgpuDeviceCreateBuffer(gpu->device, &bd);
  }
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
    entries[2] = WGPU_BIND_GROUP_LAYOUT_ENTRY_INIT;
    entries[2].binding = 2;
    entries[2].visibility = WGPUShaderStage_Fragment;
    entries[2].buffer.type = WGPUBufferBindingType_Uniform;
    entries[2].buffer.minBindingSize = 32;
    WGPUBindGroupLayoutDescriptor ld = WGPU_BIND_GROUP_LAYOUT_DESCRIPTOR_INIT;
    ld.entryCount = 3;
    ld.entries = entries;
    g_bindLayout = wgpuDeviceCreateBindGroupLayout(gpu->device, &ld);
  }

  WGPUShaderSourceWGSL wgsl = WGPU_SHADER_SOURCE_WGSL_INIT;
  wgsl.code = {kSplashShader, WGPU_STRLEN};
  WGPUShaderModuleDescriptor smd = WGPU_SHADER_MODULE_DESCRIPTOR_INIT;
  smd.nextInChain = &wgsl.chain;
  WGPUShaderModule module = wgpuDeviceCreateShaderModule(gpu->device, &smd);

  WGPUPipelineLayoutDescriptor pld = WGPU_PIPELINE_LAYOUT_DESCRIPTOR_INIT;
  pld.bindGroupLayoutCount = 1;
  pld.bindGroupLayouts = &g_bindLayout;
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
  g_pipeline = wgpuDeviceCreateRenderPipeline(gpu->device, &pd);
  g_pipelineFormat = targetFormat;

  wgpuPipelineLayoutRelease(layout);
  wgpuShaderModuleRelease(module);
  return g_pipeline != nullptr;
}

/** Alfa da marca no instante t (ms desde o início da splash). */
float logoAlpha(double t) {
  if (t < kFadeInMs) return static_cast<float>(t / kFadeInMs);
  if (t < kFadeInMs + kHoldMs) return 1.0f;
  return 1.0f - static_cast<float>((t - kFadeInMs - kHoldMs) / kFadeOutMs);
}

/** Retângulo da marca em UV da tela, preservando o aspecto do PNG. */
void logoRect(const HostGpu* gpu, float out[4]) {
  const float screenW = static_cast<float>(gpu->width);
  const float screenH = static_cast<float>(gpu->height);
  const float aspect = static_cast<float>(g_logoW) / static_cast<float>(g_logoH);
  float w = screenW * kMaxWidthFrac;
  float h = w / aspect;
  if (h > screenH * kMaxHeightFrac) {
    h = screenH * kMaxHeightFrac;
    w = h * aspect;
  }
  const float x0 = (screenW - w) * 0.5f;
  const float y0 = (screenH - h) * 0.5f;
  out[0] = x0 / screenW;
  out[1] = y0 / screenH;
  out[2] = (x0 + w) / screenW;
  out[3] = (y0 + h) / screenH;
}

}  // namespace

bool splashFrame(HostGpu* gpu, double elapsedMs) {
  if (g_finished || g_failed) return false;
  // O device só existe depois que o JS pediu (navigator.gpu). Até lá, espera —
  // sem contar o tempo, senão a splash "vence" durante o boot e ninguém a vê.
  if (!gpu->device || !gpu->queue || gpu->width <= 0 || gpu->height <= 0) return false;

  if (g_startMs < 0.0) g_startMs = elapsedMs;
  const double t = elapsedMs - g_startMs;
  if (t >= kTotalMs) {
    shutdownSplash();
    g_finished = true;
    return false;
  }

  if (!ensureTexture(gpu) || !ensurePipeline(gpu, gpu->requestedFormat)) {
    g_failed = true;  // nunca deixa a splash impedir o jogo de rodar
    shutdownSplash();
    return false;
  }

  float uniform[8] = {0, 0, 0, 0, 0, 0, 0, 0};
  logoRect(gpu, uniform);
  uniform[4] = logoAlpha(t);
  wgpuQueueWriteBuffer(gpu->queue, g_uniform, 0, uniform, sizeof(uniform));

  WGPUTexture swap = acquireSurfaceTexture(gpu);
  if (!swap) return true;  // surface indisponível neste frame — tenta no próximo
  WGPUTextureView swapView = wgpuTextureCreateView(swap, nullptr);

  WGPUBindGroupEntry bg[3] = {};
  bg[0] = WGPU_BIND_GROUP_ENTRY_INIT;
  bg[0].binding = 0;
  bg[0].textureView = g_view;
  bg[1] = WGPU_BIND_GROUP_ENTRY_INIT;
  bg[1].binding = 1;
  bg[1].sampler = g_sampler;
  bg[2] = WGPU_BIND_GROUP_ENTRY_INIT;
  bg[2].binding = 2;
  bg[2].buffer = g_uniform;
  bg[2].offset = 0;
  bg[2].size = sizeof(uniform);
  WGPUBindGroupDescriptor bgd = WGPU_BIND_GROUP_DESCRIPTOR_INIT;
  bgd.layout = g_bindLayout;
  bgd.entryCount = 3;
  bgd.entries = bg;
  WGPUBindGroup bindGroup = wgpuDeviceCreateBindGroup(gpu->device, &bgd);

  WGPURenderPassColorAttachment att = WGPU_RENDER_PASS_COLOR_ATTACHMENT_INIT;
  att.view = swapView;
  att.loadOp = WGPULoadOp_Clear;
  att.storeOp = WGPUStoreOp_Store;
  att.clearValue = {0.051, 0.055, 0.078, 1.0};
  WGPURenderPassDescriptor pass = WGPU_RENDER_PASS_DESCRIPTOR_INIT;
  pass.colorAttachmentCount = 1;
  pass.colorAttachments = &att;

  WGPUCommandEncoder encoder = wgpuDeviceCreateCommandEncoder(gpu->device, nullptr);
  WGPURenderPassEncoder rp = wgpuCommandEncoderBeginRenderPass(encoder, &pass);
  wgpuRenderPassEncoderSetPipeline(rp, g_pipeline);
  wgpuRenderPassEncoderSetBindGroup(rp, 0, bindGroup, 0, nullptr);
  wgpuRenderPassEncoderDraw(rp, 3, 1, 0, 0);
  wgpuRenderPassEncoderEnd(rp);
  wgpuRenderPassEncoderRelease(rp);
  WGPUCommandBuffer cmd = wgpuCommandEncoderFinish(encoder, nullptr);
  wgpuCommandEncoderRelease(encoder);
  wgpuQueueSubmit(gpu->queue, 1, &cmd);
  wgpuCommandBufferRelease(cmd);
  wgpuBindGroupRelease(bindGroup);

  wgpuTextureViewRelease(swapView);
  wgpuSurfacePresent(gpu->surface);
  wgpuTextureRelease(swap);
  return true;
}

void shutdownSplash() {
  if (g_pipeline) wgpuRenderPipelineRelease(g_pipeline);
  if (g_bindLayout) wgpuBindGroupLayoutRelease(g_bindLayout);
  if (g_uniform) wgpuBufferRelease(g_uniform);
  if (g_sampler) wgpuSamplerRelease(g_sampler);
  if (g_view) wgpuTextureViewRelease(g_view);
  if (g_tex) wgpuTextureRelease(g_tex);
  g_pipeline = nullptr;
  g_bindLayout = nullptr;
  g_uniform = nullptr;
  g_sampler = nullptr;
  g_view = nullptr;
  g_tex = nullptr;
  g_pipelineFormat = WGPUTextureFormat_Undefined;
}

}  // namespace webgpu
