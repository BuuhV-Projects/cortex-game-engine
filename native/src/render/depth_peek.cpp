// Ver depth_peek.h (SPEC-0241, passo 3) — TEMPORÁRIA.
#include "depth_peek.h"

#include "../core/host_gpu.h"

#include <webgpu/wgpu.h>

#include <cstdio>
#include <cstdlib>
#include <cstring>

namespace render {
namespace {

/**
 * Triângulo que cobre a tela e amostra a profundidade por coordenada de pixel.
 * `textureLoad` em vez de sampler: profundidade não se interpola, e assim o
 * valor lido é exatamente o que está no texel.
 */
const char* kShaderPeek = R"WGSL(
@group(0) @binding(0) var profundidade : texture_depth_2d;

@vertex
fn vs(@builtin(vertex_index) i : u32) -> @builtin(position) vec4f {
  var pos = array<vec2f, 3>(vec2f(-1.0, -3.0), vec2f(3.0, 1.0), vec2f(-1.0, 1.0));
  return vec4f(pos[i], 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) p : vec4f) -> @location(0) vec4f {
  let z = textureLoad(profundidade, vec2i(i32(p.x), i32(p.y)), 0);
  return vec4f(z, z, z, 1.0);
}
)WGSL";

struct Recursos {
  WGPURenderPipeline pipeline = nullptr;
  WGPUBindGroupLayout layout = nullptr;
  WGPUTextureFormat formatoCor = WGPUTextureFormat_Undefined;
  uint32_t amostras = 0;
};

Recursos& recursos() {
  static Recursos instancia;
  return instancia;
}

bool garantir(HostGpu* gpu, Recursos& r, WGPUTextureFormat cor, uint32_t amostras) {
  if (r.pipeline && r.formatoCor == cor && r.amostras == amostras) return true;
  if (r.pipeline) wgpuRenderPipelineRelease(r.pipeline);
  r.pipeline = nullptr;

  if (!r.layout) {
    WGPUBindGroupLayoutEntry entrada = WGPU_BIND_GROUP_LAYOUT_ENTRY_INIT;
    entrada.binding = 0;
    entrada.visibility = WGPUShaderStage_Fragment;
    entrada.texture.sampleType = WGPUTextureSampleType_Depth;
    entrada.texture.viewDimension = WGPUTextureViewDimension_2D;
    WGPUBindGroupLayoutDescriptor ld = WGPU_BIND_GROUP_LAYOUT_DESCRIPTOR_INIT;
    ld.entryCount = 1;
    ld.entries = &entrada;
    r.layout = wgpuDeviceCreateBindGroupLayout(gpu->device, &ld);
    if (!r.layout) return false;
  }

  WGPUPipelineLayoutDescriptor pld = WGPU_PIPELINE_LAYOUT_DESCRIPTOR_INIT;
  pld.bindGroupLayoutCount = 1;
  pld.bindGroupLayouts = &r.layout;
  WGPUPipelineLayout layout = wgpuDeviceCreatePipelineLayout(gpu->device, &pld);
  if (!layout) return false;

  WGPUShaderSourceWGSL wgsl = WGPU_SHADER_SOURCE_WGSL_INIT;
  wgsl.code = WGPUStringView{kShaderPeek, std::strlen(kShaderPeek)};
  WGPUShaderModuleDescriptor sd = WGPU_SHADER_MODULE_DESCRIPTOR_INIT;
  sd.nextInChain = &wgsl.chain;
  WGPUShaderModule modulo = wgpuDeviceCreateShaderModule(gpu->device, &sd);
  if (!modulo) {
    wgpuPipelineLayoutRelease(layout);
    return false;
  }

  WGPUColorTargetState alvo = WGPU_COLOR_TARGET_STATE_INIT;
  alvo.format = cor;
  alvo.writeMask = WGPUColorWriteMask_All;

  WGPUFragmentState fs = WGPU_FRAGMENT_STATE_INIT;
  fs.module = modulo;
  fs.entryPoint = WGPUStringView{"fs", 2};
  fs.targetCount = 1;
  fs.targets = &alvo;

  WGPURenderPipelineDescriptor pd = WGPU_RENDER_PIPELINE_DESCRIPTOR_INIT;
  pd.layout = layout;
  pd.vertex.module = modulo;
  pd.vertex.entryPoint = WGPUStringView{"vs", 2};
  pd.primitive.topology = WGPUPrimitiveTopology_TriangleList;
  pd.fragment = &fs;
  pd.multisample.count = amostras;

  r.pipeline = wgpuDeviceCreateRenderPipeline(gpu->device, &pd);
  wgpuShaderModuleRelease(modulo);
  wgpuPipelineLayoutRelease(layout);
  if (!r.pipeline) return false;
  r.formatoCor = cor;
  r.amostras = amostras;
  return true;
}

}  // namespace

bool depthPeekEnabled() {
  static const bool ligada = std::getenv("CORTEX_DEPTH_PEEK") != nullptr;
  return ligada;
}

void depthPeek(HostGpu* gpu, WGPUTexture alvoCor, WGPUTexture profundidade,
               WGPUTextureView viewProfundidade) {
  if (!gpu || !gpu->device || !gpu->queue || !profundidade) return;
  if (!alvoCor) alvoCor = gpu->offscreenTexture;
  if (!alvoCor) return;

  Recursos& r = recursos();
  const WGPUTextureFormat formatoCor = wgpuTextureGetFormat(alvoCor);
  const uint32_t amostras = wgpuTextureGetSampleCount(alvoCor);
  if (!garantir(gpu, r, formatoCor, amostras)) {
    std::fprintf(stderr, "[depth-peek] nao consegui criar o pipeline da sonda\n");
    return;
  }

  // Prefere a view que o `three` usa, quando ela vem: se o conteudo estiver
  // nela e nao na textura, e sinal de que sao recursos diferentes.
  const bool viewEmprestada = viewProfundidade != nullptr;
  WGPUTextureViewDescriptor vd = WGPU_TEXTURE_VIEW_DESCRIPTOR_INIT;
  vd.aspect = WGPUTextureAspect_DepthOnly;
  WGPUTextureView viewProf =
      viewEmprestada ? viewProfundidade : wgpuTextureCreateView(profundidade, &vd);
  if (!viewProf) return;
  std::fprintf(stderr, "[depth-peek] usando %s\n",
               viewEmprestada ? "a view do three" : "uma view nova da textura");
  std::fflush(stderr);

  WGPUBindGroupEntry entrada = WGPU_BIND_GROUP_ENTRY_INIT;
  entrada.binding = 0;
  entrada.textureView = viewProf;
  WGPUBindGroupDescriptor gd = WGPU_BIND_GROUP_DESCRIPTOR_INIT;
  gd.layout = r.layout;
  gd.entryCount = 1;
  gd.entries = &entrada;
  WGPUBindGroup grupo = wgpuDeviceCreateBindGroup(gpu->device, &gd);
  if (!grupo) {
    if (!viewEmprestada) wgpuTextureViewRelease(viewProf);
    return;
  }

  WGPUTextureView viewCor = wgpuTextureCreateView(alvoCor, nullptr);
  WGPURenderPassColorAttachment cor = WGPU_RENDER_PASS_COLOR_ATTACHMENT_INIT;
  cor.view = viewCor;
  cor.loadOp = WGPULoadOp_Load;
  cor.storeOp = WGPUStoreOp_Store;

  WGPURenderPassDescriptor rp = WGPU_RENDER_PASS_DESCRIPTOR_INIT;
  rp.colorAttachmentCount = 1;
  rp.colorAttachments = &cor;

  WGPUCommandEncoderDescriptor ed = WGPU_COMMAND_ENCODER_DESCRIPTOR_INIT;
  WGPUCommandEncoder encoder = wgpuDeviceCreateCommandEncoder(gpu->device, &ed);
  WGPURenderPassEncoder pass = wgpuCommandEncoderBeginRenderPass(encoder, &rp);
  wgpuRenderPassEncoderSetPipeline(pass, r.pipeline);
  wgpuRenderPassEncoderSetBindGroup(pass, 0, grupo, 0, nullptr);
  wgpuRenderPassEncoderDraw(pass, 3, 1, 0, 0);
  wgpuRenderPassEncoderEnd(pass);
  wgpuRenderPassEncoderRelease(pass);

  WGPUCommandBufferDescriptor cd = WGPU_COMMAND_BUFFER_DESCRIPTOR_INIT;
  WGPUCommandBuffer cmd = wgpuCommandEncoderFinish(encoder, &cd);
  wgpuQueueSubmit(gpu->queue, 1, &cmd);
  wgpuCommandBufferRelease(cmd);
  wgpuCommandEncoderRelease(encoder);
  wgpuTextureViewRelease(viewCor);
  wgpuBindGroupRelease(grupo);
  if (!viewEmprestada) wgpuTextureViewRelease(viewProf);
}

}  // namespace render
