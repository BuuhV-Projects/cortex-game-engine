// navigator.gpu — ponto de entrada da API WebGPU pro JS, e dono do estado
// compartilhado do módulo (gpuState).

#include <webgpu/wgpu.h>

#include <cstdio>

#include "../napi/napi_util.h"
#include "enums.h"
#include "internal.h"

namespace webgpu {
namespace {

HostGpu* g_gpu = nullptr;

struct AdapterResult {
  WGPUAdapter adapter = nullptr;
  bool done = false;
};

// Aquisição síncrona: o wgpu-native não implementa wgpuInstanceWaitAny
// (panic "not implemented" na v29) — o padrão suportado é AllowProcessEvents
// + bombear wgpuInstanceProcessEvents até o callback disparar.
WGPUAdapter acquireAdapter(HostGpu* gpu) {
  AdapterResult result;
  WGPURequestAdapterOptions opts = WGPU_REQUEST_ADAPTER_OPTIONS_INIT;
  opts.compatibleSurface = gpu->surface;
  WGPURequestAdapterCallbackInfo cb = WGPU_REQUEST_ADAPTER_CALLBACK_INFO_INIT;
  cb.mode = WGPUCallbackMode_AllowProcessEvents;
  cb.userdata1 = &result;
  cb.callback = [](WGPURequestAdapterStatus status, WGPUAdapter adapter,
                   WGPUStringView message, void* userdata1, void*) {
    auto* r = static_cast<AdapterResult*>(userdata1);
    if (status == WGPURequestAdapterStatus_Success) {
      r->adapter = adapter;
    } else {
      std::fprintf(stderr, "requestAdapter: %.*s\n",
                   static_cast<int>(message.length), message.data);
    }
    r->done = true;
  };
  wgpuInstanceRequestAdapter(gpu->instance, &opts, cb);
  while (!result.done) wgpuInstanceProcessEvents(gpu->instance);
  return result.adapter;
}

// Variante LINEAR (não-sRGB) de um formato de surface. O browser SEMPRE
// reporta o formato de canvas sem -srgb e o Three faz a conversão gamma no
// shader (outputColorSpace). O wgpu-native reporta -srgb como preferido →
// se aceitássemos, haveria DUPLA conversão sRGB (gamma/iluminação erradas).
WGPUTextureFormat stripSrgb(WGPUTextureFormat format) {
  switch (format) {
    case WGPUTextureFormat_BGRA8UnormSrgb: return WGPUTextureFormat_BGRA8Unorm;
    case WGPUTextureFormat_RGBA8UnormSrgb: return WGPUTextureFormat_RGBA8Unorm;
    default: return format;
  }
}

void cachePreferredFormat(HostGpu* gpu) {
  WGPUSurfaceCapabilities caps = WGPU_SURFACE_CAPABILITIES_INIT;
  wgpuSurfaceGetCapabilities(gpu->surface, gpu->adapter, &caps);
  if (caps.formatCount > 0) gpu->preferredFormat = stripSrgb(caps.formats[0]);
  wgpuSurfaceCapabilitiesFreeMembers(caps);
}

napi_value makeAdapterObject(napi_env env, WGPUAdapter adapter) {
  napi_value obj = njs::wrapHandle(env, adapter, njs::finalizeNoop);
  njs::setMethod(env, obj, "requestDevice", adapterRequestDevice);
  return obj;
}

}  // namespace

HostGpu* gpuState() { return g_gpu; }

napi_value gpuRequestAdapter(napi_env env, napi_callback_info) {
  HostGpu* gpu = gpuState();
  if (!gpu) {
    njs::throwError(env, "requestAdapter: host não inicializado");
    return njs::undefined(env);
  }
  if (!gpu->adapter) {
    gpu->adapter = acquireAdapter(gpu);
    if (!gpu->adapter) {
      njs::throwError(env, "nenhum adapter WebGPU disponível");
      return njs::undefined(env);
    }
    cachePreferredFormat(gpu);
  }
  return njs::resolvedPromise(env, makeAdapterObject(env, gpu->adapter));
}

napi_value gpuGetPreferredCanvasFormat(napi_env env, napi_callback_info) {
  HostGpu* gpu = gpuState();
  const char* format =
      gpu ? formatToString(gpu->preferredFormat) : "bgra8unorm";
  napi_value out = nullptr;
  napi_create_string_utf8(env, format, NAPI_AUTO_LENGTH, &out);
  return out;
}

// __cortexUiLayer(textureOrNull) — o JS (RendererUiBackend, ADR-0105) passa a
// textura da UI (RenderTarget própria, linear premultiplicado) pra o host compor
// sobre o jogo EM GAMA no present. `null`/sem-arg = sem UI neste frame (só o jogo).
// A textura é NÃO-own (a RT vive no three/JS); vale durante o frame corrente.
napi_value cortexUiLayer(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  HostGpu* gpu = gpuState();
  if (!gpu) return njs::undefined(env);
  // O JS usa o caminho de composição → daqui pra frente sempre via offscreen
  // (pra o blit/composição rodar mesmo com renderScale=1).
  gpu->uiCompositor = true;
  WGPUTexture tex = nullptr;
  if (argc >= 1) {
    napi_valuetype type = napi_undefined;
    napi_typeof(env, args[0], &type);
    if (type == napi_object)
      tex = static_cast<WGPUTexture>(njs::unwrapValue(env, args[0]));
  }
  gpu->uiTexture = tex;
  gpu->uiPending = true;  // apresenta este frame mesmo sem render do jogo (menus)
  return njs::undefined(env);
}

void registerBindings(napi_env env, HostGpu* gpu) {
  g_gpu = gpu;

  napi_value global = nullptr;
  napi_get_global(env, &global);
  njs::setMethod(env, global, "__cortexUiLayer", cortexUiLayer);

  napi_value gpuObj = njs::makeObject(env);
  njs::setMethod(env, gpuObj, "requestAdapter", gpuRequestAdapter);
  njs::setMethod(env, gpuObj, "getPreferredCanvasFormat",
                 gpuGetPreferredCanvasFormat);

  napi_value navigator = njs::makeObject(env);
  napi_set_named_property(env, navigator, "gpu", gpuObj);
  napi_set_named_property(env, global, "navigator", navigator);

  napi_value context = njs::makeObject(env);
  njs::setMethod(env, context, "configure", contextConfigure);
  njs::setMethod(env, context, "getCurrentTexture", contextGetCurrentTexture);
  napi_set_named_property(env, global, "gpuContext", context);

  registerBufferUsageGlobals(env);
}

}  // namespace webgpu
