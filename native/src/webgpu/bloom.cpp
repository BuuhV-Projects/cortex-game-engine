#include "bloom.h"

#include <cstdint>
#include <vector>

#include "../napi/napi_util.h"
#include "bloom_wgsl.h"  // gerado pelo CMake a partir de shaders/bloom.wgsl
#include "internal.h"

namespace webgpu {
namespace {

// Níveis da pirâmide. 5 dá o mesmo alcance de halo do `UnrealBloomPass` do three
// (que usa 5 mips) — aqui cada nível custa UMA passada em vez de duas, porque o
// filtro é dual em vez de gaussiano separável.
constexpr int kMaxLevels = 5;
// Menor lado aceitável de um nível: abaixo disso o tap de 2 texels amostra fora
// e o halo ganha borda dura.
constexpr uint32_t kMinLevelSize = 8;
// Formato da pirâmide: HDR. Em 8 bits o bright pass satura e o halo vira chapado.
constexpr WGPUTextureFormat kBloomFormat = WGPUTextureFormat_RGBA16Float;

// Uniform por passada — casa com `BloomParams` do WGSL (vec2 + 2 floats = 16 B).
struct Params {
  float texelX;
  float texelY;
  float threshold;
  float param;
};

struct Level {
  WGPUTexture texture = nullptr;
  WGPUTextureView view = nullptr;
  uint32_t width = 0;
  uint32_t height = 0;
};

struct Pass {
  WGPUBindGroup bindGroup = nullptr;
  WGPUBuffer uniform = nullptr;
  int target = 0;   // nível de destino
  int source = 0;   // nível de origem (-1 = offscreen do jogo)
  bool additive = false;
};

WGPUBindGroupLayout g_layout = nullptr;
WGPUPipelineLayout g_pipelineLayout = nullptr;
WGPURenderPipeline g_bright = nullptr;
WGPURenderPipeline g_down = nullptr;
WGPURenderPipeline g_up = nullptr;
WGPUSampler g_sampler = nullptr;
std::vector<Level> g_levels;
std::vector<Pass> g_passes;
int g_builtWidth = 0;
int g_builtHeight = 0;

WGPURenderPipeline createPipeline(HostGpu* gpu, WGPUShaderModule module,
                                  const char* entry, bool additive) {
  WGPUBlendState blend = WGPU_BLEND_STATE_INIT;
  // Upsample SOMA no nível de cima — é a soma dos níveis que forma o halo largo.
  blend.color.operation = WGPUBlendOperation_Add;
  blend.color.srcFactor = WGPUBlendFactor_One;
  blend.color.dstFactor = WGPUBlendFactor_One;
  blend.alpha.operation = WGPUBlendOperation_Add;
  blend.alpha.srcFactor = WGPUBlendFactor_One;
  blend.alpha.dstFactor = WGPUBlendFactor_One;

  WGPUColorTargetState target = WGPU_COLOR_TARGET_STATE_INIT;
  target.format = kBloomFormat;
  if (additive) target.blend = &blend;

  WGPUFragmentState fragment = WGPU_FRAGMENT_STATE_INIT;
  fragment.module = module;
  fragment.entryPoint = {entry, WGPU_STRLEN};
  fragment.targetCount = 1;
  fragment.targets = &target;

  WGPURenderPipelineDescriptor pd = WGPU_RENDER_PIPELINE_DESCRIPTOR_INIT;
  pd.layout = g_pipelineLayout;
  pd.vertex.module = module;
  pd.vertex.entryPoint = {"vs", WGPU_STRLEN};
  pd.primitive.topology = WGPUPrimitiveTopology_TriangleList;
  pd.fragment = &fragment;
  return wgpuDeviceCreateRenderPipeline(gpu->device, &pd);
}

void ensureStatics(HostGpu* gpu) {
  if (g_layout) return;

  WGPUSamplerDescriptor sd = WGPU_SAMPLER_DESCRIPTOR_INIT;
  sd.magFilter = WGPUFilterMode_Linear;
  sd.minFilter = WGPUFilterMode_Linear;
  // Clamp: sem isso o tap perto da borda envolve pra o outro lado e acende um
  // halo fantasma na margem oposta da tela.
  sd.addressModeU = WGPUAddressMode_ClampToEdge;
  sd.addressModeV = WGPUAddressMode_ClampToEdge;
  g_sampler = wgpuDeviceCreateSampler(gpu->device, &sd);

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
  entries[2].buffer.minBindingSize = sizeof(Params);
  WGPUBindGroupLayoutDescriptor ld = WGPU_BIND_GROUP_LAYOUT_DESCRIPTOR_INIT;
  ld.entryCount = 3;
  ld.entries = entries;
  g_layout = wgpuDeviceCreateBindGroupLayout(gpu->device, &ld);

  WGPUPipelineLayoutDescriptor pld = WGPU_PIPELINE_LAYOUT_DESCRIPTOR_INIT;
  pld.bindGroupLayoutCount = 1;
  pld.bindGroupLayouts = &g_layout;
  g_pipelineLayout = wgpuDeviceCreatePipelineLayout(gpu->device, &pld);

  WGPUShaderSourceWGSL wgsl = WGPU_SHADER_SOURCE_WGSL_INIT;
  wgsl.code = {kBloomWGSL, WGPU_STRLEN};
  WGPUShaderModuleDescriptor smd = WGPU_SHADER_MODULE_DESCRIPTOR_INIT;
  smd.nextInChain = &wgsl.chain;
  WGPUShaderModule module = wgpuDeviceCreateShaderModule(gpu->device, &smd);

  g_bright = createPipeline(gpu, module, "fsBright", false);
  g_down = createPipeline(gpu, module, "fsDown", false);
  g_up = createPipeline(gpu, module, "fsUp", true);
  wgpuShaderModuleRelease(module);
}

void releaseLevelsAndPasses() {
  for (auto& p : g_passes) {
    if (p.bindGroup) wgpuBindGroupRelease(p.bindGroup);
    if (p.uniform) wgpuBufferRelease(p.uniform);
  }
  g_passes.clear();
  for (auto& l : g_levels) {
    if (l.view) wgpuTextureViewRelease(l.view);
    if (l.texture) wgpuTextureRelease(l.texture);
  }
  g_levels.clear();
}

/** Bind group de uma passada: textura de origem + sampler + uniform próprio. */
Pass makePass(HostGpu* gpu, WGPUTextureView srcView, int source, int target,
              bool additive) {
  Pass pass;
  pass.source = source;
  pass.target = target;
  pass.additive = additive;

  WGPUBufferDescriptor bd = WGPU_BUFFER_DESCRIPTOR_INIT;
  bd.size = sizeof(Params);
  bd.usage = WGPUBufferUsage_Uniform | WGPUBufferUsage_CopyDst;
  pass.uniform = wgpuDeviceCreateBuffer(gpu->device, &bd);

  WGPUBindGroupEntry bg[3] = {};
  bg[0] = WGPU_BIND_GROUP_ENTRY_INIT;
  bg[0].binding = 0;
  bg[0].textureView = srcView;
  bg[1] = WGPU_BIND_GROUP_ENTRY_INIT;
  bg[1].binding = 1;
  bg[1].sampler = g_sampler;
  bg[2] = WGPU_BIND_GROUP_ENTRY_INIT;
  bg[2].binding = 2;
  bg[2].buffer = pass.uniform;
  bg[2].size = sizeof(Params);
  WGPUBindGroupDescriptor bgd = WGPU_BIND_GROUP_DESCRIPTOR_INIT;
  bgd.layout = g_layout;
  bgd.entryCount = 3;
  bgd.entries = bg;
  pass.bindGroup = wgpuDeviceCreateBindGroup(gpu->device, &bgd);
  return pass;
}

// Fonte da pirâmide neste frame (a cena HDR), pra o uniform da passada 0.
int g_srcW = 0;
int g_srcH = 0;

/** (re)cria a pirâmide + as passadas pra uma fonte `srcW`×`srcH`. */
bool ensureBloom(HostGpu* gpu, WGPUTextureView srcView, int srcW, int srcH) {
  if (!gpu->device || !srcView || srcW <= 0 || srcH <= 0) return false;
  g_srcW = srcW;
  g_srcH = srcH;
  if (!g_levels.empty() && g_builtWidth == srcW && g_builtHeight == srcH) {
    // Mesma dimensão, mas a textura-fonte pode mudar de frame a frame (RT do
    // three): o bind group da passada 0 aponta pra fonte → reconstrói só ele.
    if (!g_passes.empty()) {
      Pass& first = g_passes[0];
      if (first.bindGroup) wgpuBindGroupRelease(first.bindGroup);
      if (first.uniform) wgpuBufferRelease(first.uniform);
      first = makePass(gpu, srcView, -1, 0, false);
    }
    return true;
  }

  ensureStatics(gpu);
  releaseLevelsAndPasses();

  // Pirâmide a partir da METADE da fonte (o bloom é de baixa frequência —
  // resolução cheia só gastaria banda sem mudar o halo).
  uint32_t w = static_cast<uint32_t>(srcW) / 2;
  uint32_t h = static_cast<uint32_t>(srcH) / 2;
  for (int i = 0; i < kMaxLevels; i++) {
    if (w < kMinLevelSize || h < kMinLevelSize) break;
    Level level;
    level.width = w;
    level.height = h;
    WGPUTextureDescriptor td = WGPU_TEXTURE_DESCRIPTOR_INIT;
    td.size = {w, h, 1};
    td.format = kBloomFormat;
    td.usage =
        WGPUTextureUsage_RenderAttachment | WGPUTextureUsage_TextureBinding;
    td.dimension = WGPUTextureDimension_2D;
    level.texture = wgpuDeviceCreateTexture(gpu->device, &td);
    level.view = wgpuTextureCreateView(level.texture, nullptr);
    g_levels.push_back(level);
    w /= 2;
    h /= 2;
  }
  if (g_levels.empty()) return false;

  const int n = static_cast<int>(g_levels.size());
  // 1) bright pass: cena HDR → nível 0.
  g_passes.push_back(makePass(gpu, srcView, -1, 0, false));
  // 2) descida: nível i → i+1.
  for (int i = 0; i + 1 < n; i++) {
    g_passes.push_back(makePass(gpu, g_levels[i].view, i, i + 1, false));
  }
  // 3) subida ADITIVA: nível i → i-1 (soma no que já está lá).
  for (int i = n - 1; i > 0; i--) {
    g_passes.push_back(makePass(gpu, g_levels[i].view, i, i - 1, true));
  }

  g_builtWidth = srcW;
  g_builtHeight = srcH;
  return true;
}

}  // namespace

void renderBloom(HostGpu* gpu, WGPUTextureView srcView, int srcW, int srcH) {
  if (!ensureBloom(gpu, srcView, srcW, srcH)) return;

  // Uniforms: o texel é o da TEXTURA DE ORIGEM (o raio dos taps acompanha o
  // nível). Reescritos por frame — 16 B por passada é ruído perto de uma
  // travessia NAPI, e assim mexer em threshold/raio no Inspector vale na hora.
  for (const auto& pass : g_passes) {
    const bool fromSource = pass.source < 0;
    const float srcWf = fromSource ? static_cast<float>(g_srcW)
                                   : static_cast<float>(g_levels[pass.source].width);
    const float srcHf = fromSource ? static_cast<float>(g_srcH)
                                   : static_cast<float>(g_levels[pass.source].height);
    Params p{};
    p.texelX = 1.0f / srcWf;
    p.texelY = 1.0f / srcHf;
    p.threshold = gpu->bloom.threshold;
    // No upsample o `param` é o raio do tent; nas outras passadas não é lido.
    p.param = pass.additive ? gpu->bloom.radius : 0.0f;
    wgpuQueueWriteBuffer(gpu->queue, pass.uniform, 0, &p, sizeof(p));
  }

  WGPUCommandEncoder enc = wgpuDeviceCreateCommandEncoder(gpu->device, nullptr);
  for (const auto& pass : g_passes) {
    const Level& dst = g_levels[pass.target];
    WGPURenderPassColorAttachment att = WGPU_RENDER_PASS_COLOR_ATTACHMENT_INIT;
    att.view = dst.view;
    // Aditivo PRESERVA o destino (é a soma dos níveis que faz o halo); os demais
    // sobrescrevem.
    att.loadOp = pass.additive ? WGPULoadOp_Load : WGPULoadOp_Clear;
    att.storeOp = WGPUStoreOp_Store;
    att.clearValue = {0, 0, 0, 1};
    WGPURenderPassDescriptor rpd = WGPU_RENDER_PASS_DESCRIPTOR_INIT;
    rpd.colorAttachmentCount = 1;
    rpd.colorAttachments = &att;

    WGPURenderPassEncoder rp = wgpuCommandEncoderBeginRenderPass(enc, &rpd);
    WGPURenderPipeline pipeline =
        pass.additive ? g_up : (pass.source < 0 ? g_bright : g_down);
    wgpuRenderPassEncoderSetPipeline(rp, pipeline);
    wgpuRenderPassEncoderSetBindGroup(rp, 0, pass.bindGroup, 0, nullptr);
    wgpuRenderPassEncoderDraw(rp, 3, 1, 0, 0);
    wgpuRenderPassEncoderEnd(rp);
    wgpuRenderPassEncoderRelease(rp);
  }
  WGPUCommandBuffer cmd = wgpuCommandEncoderFinish(enc, nullptr);
  wgpuCommandEncoderRelease(enc);
  wgpuQueueSubmit(gpu->queue, 1, &cmd);
  wgpuCommandBufferRelease(cmd);
}

WGPUTextureView bloomResultView() {
  return g_levels.empty() ? nullptr : g_levels[0].view;
}

void destroyBloom() {
  releaseLevelsAndPasses();
  g_builtWidth = 0;
  g_builtHeight = 0;
}

namespace {

/** `__cortexBloom(config | null)` — ver o contrato no bloom.h. */
napi_value jsBloom(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1] = {nullptr};
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  HostGpu* gpu = gpuState();
  if (!gpu) return njs::undefined(env);

  napi_valuetype type = napi_undefined;
  if (argc >= 1 && argv[0]) napi_typeof(env, argv[0], &type);
  if (type != napi_object) {
    // Desligar: o JS volta a renderizar no offscreen normal; a pirâmide fica
    // ociosa (o present para de chamar renderBloom quando !bloom.enabled).
    gpu->bloom.enabled = false;
    return njs::undefined(env);
  }

  HostGpu::Bloom& b = gpu->bloom;
  b.strength = static_cast<float>(njs::getNamedNumber(env, argv[0], "strength", b.strength));
  b.threshold = static_cast<float>(njs::getNamedNumber(env, argv[0], "threshold", b.threshold));
  b.radius = static_cast<float>(njs::getNamedNumber(env, argv[0], "radius", b.radius));
  b.exposure = static_cast<float>(njs::getNamedNumber(env, argv[0], "exposure", b.exposure));
  b.vignette = njs::getNamedBool(env, argv[0], "vignette", b.vignette);
  b.vignetteIntensity =
      static_cast<float>(njs::getNamedNumber(env, argv[0], "vignetteIntensity", b.vignetteIntensity));
  b.vignetteInner =
      static_cast<float>(njs::getNamedNumber(env, argv[0], "vignetteInner", b.vignetteInner));
  b.vignetteOuter =
      static_cast<float>(njs::getNamedNumber(env, argv[0], "vignetteOuter", b.vignetteOuter));
  b.enabled = true;
  return njs::undefined(env);
}

/** `__cortexSceneHdr(texture | null)` — a cena em linear HDR do frame (ADR-0149). */
napi_value jsSceneHdr(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1] = {nullptr};
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  HostGpu* gpu = gpuState();
  if (!gpu) return njs::undefined(env);
  // O JS usa o caminho de composição (força offscreen pro blit/composite rodar).
  gpu->uiCompositor = true;
  WGPUTexture tex = nullptr;
  if (argc >= 1 && argv[0]) {
    napi_valuetype type = napi_undefined;
    napi_typeof(env, argv[0], &type);
    if (type == napi_object) tex = static_cast<WGPUTexture>(njs::unwrapValue(env, argv[0]));
  }
  gpu->sceneHdrTexture = tex;
  gpu->sceneHdrPending = tex != nullptr;  // apresenta este frame (a cena chegou)
  return njs::undefined(env);
}

}  // namespace

void registerBloom(napi_env env) {
  napi_value global = nullptr;
  napi_get_global(env, &global);
  njs::setMethod(env, global, "__cortexBloom", jsBloom);
  njs::setMethod(env, global, "__cortexSceneHdr", jsSceneHdr);
}

}  // namespace webgpu
