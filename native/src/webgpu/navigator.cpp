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

void cachePreferredFormat(HostGpu* gpu) {
  WGPUSurfaceCapabilities caps = WGPU_SURFACE_CAPABILITIES_INIT;
  wgpuSurfaceGetCapabilities(gpu->surface, gpu->adapter, &caps);
  if (caps.formatCount > 0) gpu->preferredFormat = caps.formats[0];
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

void registerBindings(napi_env env, HostGpu* gpu) {
  g_gpu = gpu;

  napi_value global = nullptr;
  napi_get_global(env, &global);

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
}

}  // namespace webgpu
