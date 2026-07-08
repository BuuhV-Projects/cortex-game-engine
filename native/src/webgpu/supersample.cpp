#include "supersample.h"

#include <cstddef>

namespace webgpu {
namespace {

// Recursos de blit — criados uma vez (device é estável durante a sessão).
WGPURenderPipeline g_pipeline = nullptr;
WGPUBindGroupLayout g_bindLayout = nullptr;
WGPUSampler g_sampler = nullptr;
WGPUTextureFormat g_pipelineFormat = WGPUTextureFormat_Undefined;
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

void ensurePipeline(HostGpu* gpu, WGPUTextureFormat targetFormat) {
  if (g_pipeline && g_pipelineFormat == targetFormat) return;
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

  if (gpu->offscreenTexture && gpu->offscreenWidth == w &&
      gpu->offscreenHeight == h) {
    return gpu->offscreenView;
  }
  if (gpu->offscreenView) wgpuTextureViewRelease(gpu->offscreenView);
  if (gpu->offscreenTexture) wgpuTextureRelease(gpu->offscreenTexture);

  WGPUTextureDescriptor td = WGPU_TEXTURE_DESCRIPTOR_INIT;
  td.size = {static_cast<uint32_t>(w), static_cast<uint32_t>(h), 1};
  td.format = gpu->requestedFormat;
  td.usage =
      WGPUTextureUsage_RenderAttachment | WGPUTextureUsage_TextureBinding;
  td.dimension = WGPUTextureDimension_2D;
  gpu->offscreenTexture = wgpuDeviceCreateTexture(gpu->device, &td);
  gpu->offscreenView = wgpuTextureCreateView(gpu->offscreenTexture, nullptr);
  gpu->offscreenWidth = w;
  gpu->offscreenHeight = h;
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
  if (!gpu->offscreenView) return;
  ensurePipeline(gpu, gpu->requestedFormat);

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

  WGPUBindGroupEntry bg[3] = {};
  bg[0] = WGPU_BIND_GROUP_ENTRY_INIT;
  bg[0].binding = 0;
  bg[0].textureView = gpu->offscreenView;
  bg[1] = WGPU_BIND_GROUP_ENTRY_INIT;
  bg[1].binding = 1;
  bg[1].sampler = g_sampler;
  bg[2] = WGPU_BIND_GROUP_ENTRY_INIT;
  bg[2].binding = 2;
  bg[2].textureView = uiView;
  WGPUBindGroupDescriptor bgd = WGPU_BIND_GROUP_DESCRIPTOR_INIT;
  bgd.layout = g_bindLayout;
  bgd.entryCount = 3;
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
  if (ownUiView) wgpuTextureViewRelease(uiView);
}

}  // namespace webgpu
