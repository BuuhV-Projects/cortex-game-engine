// Ver shadow_pass_target.h (SPEC-0245; limpeza da SPEC-0690).
#include "shadow_pass_target.h"
#include "shadow_pass_timing.h"

#include "../core/host_gpu.h"
#include "../webgpu/pass_timing.h"

#include <cstdio>
#include <cstdlib>

namespace render {
namespace {

/** Valor de limpeza da profundidade: 1.0 = plano distante. */
constexpr float kDepthClearValue = 1.0f;
/** Chamadas relatadas por `CORTEX_SHADOW_PASS_LOG` antes de calar. */
constexpr int kMaxVezesLogadas = 8;
/** Fim de linha do relato (o stderr não passa pelo `debug` do JS). */
constexpr int kFimDeLinha = 0x0A;

}  // namespace

bool openShadowDepthPass(HostGpu* gpu, WGPUTexture alvo, ShadowDepthPass& out) {
  out = ShadowDepthPass{};
  if (!gpu || !gpu->device || !alvo) return false;
  out.view = wgpuTextureCreateView(alvo, nullptr);
  if (!out.view) return false;

  WGPURenderPassDepthStencilAttachment prof = WGPU_RENDER_PASS_DEPTH_STENCIL_ATTACHMENT_INIT;
  prof.view = out.view;
  prof.depthLoadOp = WGPULoadOp_Clear;
  prof.depthClearValue = kDepthClearValue;
  prof.depthStoreOp = WGPUStoreOp_Store;

  WGPURenderPassDescriptor rp = WGPU_RENDER_PASS_DESCRIPTOR_INIT;
  // Depth-only: nenhum attachment de cor.
  rp.colorAttachmentCount = 0;
  rp.colorAttachments = nullptr;
  rp.depthStencilAttachment = &prof;
  rp.timestampWrites = webgpu::nextPassTimestampWrites(webgpu::PassOrigin::Shadow);

  WGPUCommandEncoderDescriptor ed = WGPU_COMMAND_ENCODER_DESCRIPTOR_INIT;
  out.encoder = wgpuDeviceCreateCommandEncoder(gpu->device, &ed);
  out.pass = wgpuCommandEncoderBeginRenderPass(out.encoder, &rp);
  return true;
}

void submitShadowDepthPass(HostGpu* gpu, ShadowDepthPass& aberto) {
  wgpuRenderPassEncoderEnd(aberto.pass);
  wgpuRenderPassEncoderRelease(aberto.pass);

  WGPUCommandBufferDescriptor cd = WGPU_COMMAND_BUFFER_DESCRIPTOR_INIT;
  WGPUCommandBuffer cmd = wgpuCommandEncoderFinish(aberto.encoder, &cd);
  ShadowPassTiming::instance().mark(ShadowPhase::kFinish);
  wgpuQueueSubmit(gpu->queue, 1, &cmd);
  wgpuCommandBufferRelease(cmd);
  wgpuCommandEncoderRelease(aberto.encoder);
  wgpuTextureViewRelease(aberto.view);
  aberto = ShadowDepthPass{};
}

bool clearShadowDepthTarget(HostGpu* gpu, WGPUTexture alvo) {
  if (!gpu || !gpu->queue) return false;
  ShadowDepthPass aberto;
  if (!openShadowDepthPass(gpu, alvo, aberto)) return false;
  submitShadowDepthPass(gpu, aberto);
  return true;
}

void logShadowPass(WGPUTexture alvo, uint32_t itens, uint32_t desenhados, int status) {
  static const bool logar = std::getenv("CORTEX_SHADOW_PASS_LOG") != nullptr;
  static int vezes = 0;
  if (!logar || vezes >= kMaxVezesLogadas) return;
  ++vezes;
  std::fprintf(stderr, "[shadow-pass] alvo=%p %ux%u fmt=%d itens=%u desenhados=%u status=%d",
               (void*)alvo, alvo ? wgpuTextureGetWidth(alvo) : 0u,
               alvo ? wgpuTextureGetHeight(alvo) : 0u,
               alvo ? (int)wgpuTextureGetFormat(alvo) : 0, itens, desenhados, status);
  std::fputc(kFimDeLinha, stderr);
  std::fflush(stderr);
}

}  // namespace render
