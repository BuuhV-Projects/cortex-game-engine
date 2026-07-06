// surface — o "canvas" do host: gpuContext.configure/getCurrentTexture e o
// present do frame. A textura da surface é NÃO-own do lado JS: quem
// apresenta e libera é o host (presentIfAcquired), uma vez por frame.

#include "../napi/napi_util.h"
#include "bindings.h"
#include "enums.h"
#include "internal.h"
#include "supersample.h"

#include <webgpu/wgpu.h>

#include <cstdio>

namespace webgpu {
namespace {

bool isSurfaceTextureUsable(const WGPUSurfaceTexture& st) {
  return st.status == WGPUSurfaceGetCurrentTextureStatus_SuccessOptimal ||
         st.status == WGPUSurfaceGetCurrentTextureStatus_SuccessSuboptimal;
}

// Reconfigura a surface pro tamanho corrente. SÓ é chamado do caminho de
// aquisição (getCurrentTexture), onde NENHUMA textura da surface está viva —
// é o único ponto seguro (configurar com textura adquirida = "Invalid
// surface" e crash do wgpu).
// Configura a surface (usa o tamanho da 1ª config nas recuperações — janela
// é de tamanho fixo, então nunca reconfigura pra um tamanho diferente, o que
// evita o crash "Invalid surface" do wgpu-native/D3D12).
void configureSurface(HostGpu* gpu, int w, int h) {
  gpu->config = WGPU_SURFACE_CONFIGURATION_INIT;
  gpu->config.device = gpu->device;
  gpu->config.format = gpu->requestedFormat;
  gpu->config.width = static_cast<uint32_t>(w);
  gpu->config.height = static_cast<uint32_t>(h);
  gpu->config.presentMode = WGPUPresentMode_Fifo;
  wgpuSurfaceConfigure(gpu->surface, &gpu->config);
  gpu->configuredWidth = w;
  gpu->configuredHeight = h;
}

// Adquire a textura do frame. 1ª vez: configura com o tamanho da janela.
// Recuperação (Outdated/Lost): reconfigura pro MESMO tamanho já validado.
WGPUTexture acquireSurfaceTexture(HostGpu* gpu) {
  if (gpu->width <= 0 || gpu->height <= 0) return nullptr;  // minimizada
  if (gpu->configuredWidth == 0) configureSurface(gpu, gpu->width, gpu->height);

  WGPUSurfaceTexture st = WGPU_SURFACE_TEXTURE_INIT;
  wgpuSurfaceGetCurrentTexture(gpu->surface, &st);
  if (!isSurfaceTextureUsable(st)) {
    if (st.texture) wgpuTextureRelease(st.texture);
    // Recupera com o tamanho JÁ configurado (nunca um novo → sem crash).
    configureSurface(gpu, gpu->configuredWidth, gpu->configuredHeight);
    wgpuSurfaceGetCurrentTexture(gpu->surface, &st);
    if (!isSurfaceTextureUsable(st)) {
      if (st.texture) wgpuTextureRelease(st.texture);
      return nullptr;
    }
  }
  return st.texture;
}

}  // namespace

// JS/engine chama configure — aqui só REGISTRAMOS a intenção (formato +
// pendência). A reconfiguração real é no ensureSurfaceConfigured, no início
// do frame, sem textura adquirida.
napi_value contextConfigure(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  HostGpu* gpu = gpuState();
  if (!gpu || !gpu->device || argc < 1) {
    njs::throwError(env, "configure: device ausente");
    return njs::undefined(env);
  }
  // Só registra o formato + marca "configurada". A configuração REAL da
  // surface acontece no acquireSurfaceTexture (getCurrentTexture), o único
  // ponto sem textura viva — configurar aqui, no meio do frame, dava
  // "Invalid surface" no resize.
  std::string format = njs::getNamedString(env, args[0], "format", "");
  gpu->requestedFormat =
      format.empty() ? gpu->preferredFormat : formatFromString(format);
  gpu->configured = true;
  return njs::undefined(env);
}

napi_value contextGetCurrentTexture(napi_env env, napi_callback_info) {
  HostGpu* gpu = gpuState();
  if (!gpu || !gpu->configured) {
    njs::throwError(env, "getCurrentTexture: surface não configurada");
    return njs::undefined(env);
  }
  // SSAA: o JS desenha no OFFSCREEN (maior); o host faz downscale no present.
  WGPUTextureView offscreen = ensureOffscreen(gpu);
  if (offscreen) {
    // Não-own: a textura offscreen vive no HostGpu. Devolve os métodos de
    // view (createView etc.) sobre a textura offscreen.
    napi_value obj =
        njs::wrapHandle(env, gpu->offscreenTexture, njs::finalizeNoop);
    return makeTextureViewMethods(env, obj);
  }

  if (!gpu->currentTexture) gpu->currentTexture = acquireSurfaceTexture(gpu);
  if (!gpu->currentTexture) {
    // Surface temporariamente inválida (meio de um resize) — devolve null;
    // o JS pula o frame em vez de crashar.
    napi_value nullValue = nullptr;
    napi_get_null(env, &nullValue);
    return nullValue;
  }

  // Não-own: o host apresenta e libera no fim do frame. Métodos de view
  // vêm do textures.cpp (createView com/sem descriptor).
  napi_value obj = njs::wrapHandle(env, gpu->currentTexture, njs::finalizeNoop);
  return makeTextureViewMethods(env, obj);
}

void presentIfAcquired(HostGpu* gpu) {
  // SSAA: o JS desenhou no offscreen; adquire a swapchain, faz downscale e
  // apresenta.
  if (gpu->offscreenView && gpu->configured) {
    WGPUTexture swap = acquireSurfaceTexture(gpu);
    if (!swap) return;  // surface temporariamente indisponível → pula frame
    WGPUTextureView swapView = wgpuTextureCreateView(swap, nullptr);
    blitToSwapchain(gpu, swapView);
    wgpuTextureViewRelease(swapView);
    wgpuSurfacePresent(gpu->surface);
    wgpuTextureRelease(swap);
    return;
  }
  if (!gpu->currentTexture) return;
  wgpuSurfacePresent(gpu->surface);
  wgpuTextureRelease(gpu->currentTexture);
  gpu->currentTexture = nullptr;
}

}  // namespace webgpu
