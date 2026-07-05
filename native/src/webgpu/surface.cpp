// surface — o "canvas" do host: gpuContext.configure/getCurrentTexture e o
// present do frame. A textura da surface é NÃO-own do lado JS: quem
// apresenta e libera é o host (presentIfAcquired), uma vez por frame.

#include "../napi/napi_util.h"
#include "bindings.h"
#include "enums.h"
#include "internal.h"

namespace webgpu {
namespace {

bool isSurfaceTextureUsable(const WGPUSurfaceTexture& st) {
  return st.status == WGPUSurfaceGetCurrentTextureStatus_SuccessOptimal ||
         st.status == WGPUSurfaceGetCurrentTextureStatus_SuccessSuboptimal;
}

// Adquire a textura do frame; se a surface ficou inválida (resize/oclusão),
// reconfigura e tenta mais uma vez.
WGPUTexture acquireSurfaceTexture(HostGpu* gpu) {
  WGPUSurfaceTexture st = WGPU_SURFACE_TEXTURE_INIT;
  wgpuSurfaceGetCurrentTexture(gpu->surface, &st);
  if (!isSurfaceTextureUsable(st)) {
    if (st.texture) wgpuTextureRelease(st.texture);
    wgpuSurfaceConfigure(gpu->surface, &gpu->config);
    wgpuSurfaceGetCurrentTexture(gpu->surface, &st);
  }
  return st.texture;
}

}  // namespace

napi_value contextConfigure(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  HostGpu* gpu = gpuState();
  if (!gpu || !gpu->device || argc < 1) {
    njs::throwError(env, "configure: device ausente");
    return njs::undefined(env);
  }
  std::string format = njs::getNamedString(env, args[0], "format", "");

  gpu->config = WGPU_SURFACE_CONFIGURATION_INIT;
  gpu->config.device = gpu->device;
  gpu->config.format =
      format.empty() ? gpu->preferredFormat : formatFromString(format);
  gpu->config.width = static_cast<uint32_t>(gpu->width);
  gpu->config.height = static_cast<uint32_t>(gpu->height);
  gpu->config.presentMode = WGPUPresentMode_Fifo;
  wgpuSurfaceConfigure(gpu->surface, &gpu->config);
  gpu->configured = true;
  return njs::undefined(env);
}

napi_value contextGetCurrentTexture(napi_env env, napi_callback_info) {
  HostGpu* gpu = gpuState();
  if (!gpu || !gpu->configured) {
    njs::throwError(env, "getCurrentTexture: surface não configurada");
    return njs::undefined(env);
  }
  if (!gpu->currentTexture) gpu->currentTexture = acquireSurfaceTexture(gpu);

  // Não-own: o host apresenta e libera no fim do frame. Métodos de view
  // vêm do textures.cpp (createView com/sem descriptor).
  napi_value obj = njs::wrapHandle(env, gpu->currentTexture, njs::finalizeNoop);
  return makeTextureViewMethods(env, obj);
}

void presentIfAcquired(HostGpu* gpu) {
  if (!gpu->currentTexture) return;
  wgpuSurfacePresent(gpu->surface);
  wgpuTextureRelease(gpu->currentTexture);
  gpu->currentTexture = nullptr;
}

}  // namespace webgpu
