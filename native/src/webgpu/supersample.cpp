#include "supersample.h"

#include <cstddef>
#include <cstdio>
#include <string>

#include "blit_shaders.h"
#include "bloom.h"
#include "pass_timing.h"
#include "underwater.h"

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
// Uniform do efeito embaixo d'água (SPEC-0726), no binding 5 dos DOIS pipelines.
// Escrito só com o efeito ligado e uma vez ao desligar (zera o `amount`).
constexpr uint32_t kUnderwaterBinding = 5;
WGPUBuffer g_underwaterUniform = nullptr;
bool g_underwaterWritten = false;
// Textura 1×1 transparente pra o binding da UI quando NÃO há UI neste frame
// (WebGPU exige o binding preenchido; a=0 → composição passa o jogo direto).
WGPUTexture g_emptyUi = nullptr;
WGPUTextureView g_emptyUiView = nullptr;

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

/** Buffer do uniform embaixo d'água (zerado na criação = efeito desligado). */
void ensureUnderwaterUniform(HostGpu* gpu) {
  if (g_underwaterUniform) return;
  WGPUBufferDescriptor bd = WGPU_BUFFER_DESCRIPTOR_INIT;
  bd.size = sizeof(UnderwaterUniform);
  bd.usage = WGPUBufferUsage_Uniform | WGPUBufferUsage_CopyDst;
  g_underwaterUniform = wgpuDeviceCreateBuffer(gpu->device, &bd);
  const UnderwaterUniform off{};
  wgpuQueueWriteBuffer(gpu->queue, g_underwaterUniform, 0, &off, sizeof(off));
}

/** Escreve o uniform do quadro: todo quadro com o efeito ligado (a fase anda), uma vez ao desligar. */
void writeUnderwaterUniform(HostGpu* gpu) {
  ensureUnderwaterUniform(gpu);
  const bool active = underwaterActive(underwaterState());
  if (!active && !g_underwaterWritten) return;
  const UnderwaterUniform u = active ? underwaterUniformNow() : UnderwaterUniform{};
  wgpuQueueWriteBuffer(gpu->queue, g_underwaterUniform, 0, &u, sizeof(u));
  g_underwaterWritten = active;
}

/** Entrada do layout para o uniform embaixo d'água. */
WGPUBindGroupLayoutEntry underwaterLayoutEntry() {
  WGPUBindGroupLayoutEntry e = WGPU_BIND_GROUP_LAYOUT_ENTRY_INIT;
  e.binding = kUnderwaterBinding;
  e.visibility = WGPUShaderStage_Fragment;
  e.buffer.type = WGPUBufferBindingType_Uniform;
  e.buffer.minBindingSize = sizeof(UnderwaterUniform);
  return e;
}

/** Módulo WGSL `kUnderwaterWgsl + shader` (o trecho comum vem antes). */
WGPUShaderModule createBlitModule(HostGpu* gpu, const char* shader) {
  const std::string code = std::string(kUnderwaterWgsl) + shader;
  WGPUShaderSourceWGSL wgsl = WGPU_SHADER_SOURCE_WGSL_INIT;
  wgsl.code = {code.c_str(), code.size()};
  WGPUShaderModuleDescriptor smd = WGPU_SHADER_MODULE_DESCRIPTOR_INIT;
  smd.nextInChain = &wgsl.chain;
  return wgpuDeviceCreateShaderModule(gpu->device, &smd);
}

void ensurePipeline(HostGpu* gpu, WGPUTextureFormat targetFormat) {
  if (g_pipeline && g_pipelineFormat == targetFormat) return;
  if (g_pipeline) {
    wgpuRenderPipelineRelease(g_pipeline);
    g_pipeline = nullptr;
  }
  ensureSampler(gpu);
  if (!g_bindLayout) {
    WGPUBindGroupLayoutEntry entries[4] = {};
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
    entries[3] = underwaterLayoutEntry();  // SPEC-0726
    WGPUBindGroupLayoutDescriptor ld = WGPU_BIND_GROUP_LAYOUT_DESCRIPTOR_INIT;
    ld.entryCount = 4;
    ld.entries = entries;
    g_bindLayout = wgpuDeviceCreateBindGroupLayout(gpu->device, &ld);
  }

  WGPUShaderModule module = createBlitModule(gpu, kBlitShader);

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
    WGPUBindGroupLayoutEntry entries[6] = {};
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
    entries[5] = underwaterLayoutEntry();  // SPEC-0726
    WGPUBindGroupLayoutDescriptor ld = WGPU_BIND_GROUP_LAYOUT_DESCRIPTOR_INIT;
    ld.entryCount = 6;
    ld.entries = entries;
    g_hdrBindLayout = wgpuDeviceCreateBindGroupLayout(gpu->device, &ld);
  }

  WGPUShaderModule module = createBlitModule(gpu, kHdrBlitShader);

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
  pass.timestampWrites = nextPassTimestampWrites(PassOrigin::Clear);
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
    // Dimensões da PRÓPRIA RT HDR — não do offscreen: no fluxo direto-pra-fase
    // (sem frames ui-only antes, ex.: soak/dev ?level=) o offscreen ainda não
    // nasceu e `offscreenWidth/Height` = 0 — a pirâmide do bloom falhava e o
    // blit não desenhava NADA (tela presa nos buffers antigos da swapchain,
    // "splash piscando"). SPEC-0155.
    sceneW = static_cast<int>(wgpuTextureGetWidth(gpu->sceneHdrTexture));
    sceneH = static_cast<int>(wgpuTextureGetHeight(gpu->sceneHdrTexture));
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

  // Embaixo d'água (SPEC-0726): o uniform entra nos dois caminhos, no binding 5.
  writeUnderwaterUniform(gpu);
  WGPUBindGroupEntry bg[6] = {};
  for (int i = 0; i < 6; i++) {
    bg[i] = WGPU_BIND_GROUP_ENTRY_INIT;
    bg[i].binding = static_cast<uint32_t>(i);
  }
  bg[0].textureView = sceneView;
  bg[1].sampler = g_sampler;
  bg[2].textureView = uiView;
  // LDR: 0, 1, 2 e o uniform embaixo d'água na 4ª entrada; HDR: 0..5.
  WGPUBindGroupEntry& water = composite ? bg[5] : bg[3];
  water.binding = kUnderwaterBinding;
  water.buffer = g_underwaterUniform;
  water.size = sizeof(UnderwaterUniform);
  if (composite) {
    bg[3].textureView = bloomView;
    bg[4].buffer = g_hdrUniform;
    bg[4].size = sizeof(HdrParams);
  }
  WGPUBindGroupDescriptor bgd = WGPU_BIND_GROUP_DESCRIPTOR_INIT;
  bgd.layout = composite ? g_hdrBindLayout : g_bindLayout;
  bgd.entryCount = composite ? 6 : 4;
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
  pass.timestampWrites = nextPassTimestampWrites(PassOrigin::Blit);

  WGPUCommandEncoder encoder =
      wgpuDeviceCreateCommandEncoder(gpu->device, nullptr);
  WGPURenderPassEncoder rp = wgpuCommandEncoderBeginRenderPass(encoder, &pass);
  wgpuRenderPassEncoderSetPipeline(rp, composite ? g_hdrPipeline : g_pipeline);
  wgpuRenderPassEncoderSetBindGroup(rp, 0, bindGroup, 0, nullptr);
  wgpuRenderPassEncoderDraw(rp, 3, 1, 0, 0);
  wgpuRenderPassEncoderEnd(rp);
  wgpuRenderPassEncoderRelease(rp);
  // Resolve dos timestamps do frame (SPEC-0254), no ULTIMO encoder antes do
  // present: neste ponto todos os passes do frame ja escreveram. No-op sem
  // CORTEX_FRAME_TIMING.
  resolvePassTiming(encoder, gpu->queue);
  WGPUCommandBuffer cmd = wgpuCommandEncoderFinish(encoder, nullptr);
  wgpuCommandEncoderRelease(encoder);
  wgpuQueueSubmit(gpu->queue, 1, &cmd);
  // Agora sim: a copia ja executou, o buffer pode ser mapeado (SPEC-0254).
  startPassTimingRead();
  wgpuCommandBufferRelease(cmd);
  wgpuBindGroupRelease(bindGroup);
  if (ownUiView) wgpuTextureViewRelease(uiView);
  if (ownSceneView) wgpuTextureViewRelease(sceneView);
}

}  // namespace webgpu
