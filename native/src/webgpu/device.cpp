// device — SÓ aquisição do GPUDevice e composição do objeto JS `device`
// (anexa as fábricas implementadas nos outros módulos: pipeline.cpp,
// layouts.cpp, buffers.cpp, textures.cpp, commands.cpp).

#include <webgpu/wgpu.h>

#include <cstdio>

#include "../napi/napi_util.h"
#include "internal.h"

namespace webgpu {
namespace {

struct DeviceResult {
  WGPUDevice device = nullptr;
  bool done = false;
};

void logUncapturedError(WGPUDevice const*, WGPUErrorType type,
                        WGPUStringView message, void*, void*) {
  std::fprintf(stderr, "[webgpu erro %d] %.*s\n", static_cast<int>(type),
               static_cast<int>(message.length), message.data);
}

// Aquisição síncrona (mesmo padrão do acquireAdapter — ver navigator.cpp).
WGPUDevice acquireDevice(HostGpu* gpu, WGPUAdapter adapter) {
  DeviceResult result;
  WGPUDeviceDescriptor desc = WGPU_DEVICE_DESCRIPTOR_INIT;
  // Erros não capturados (shader inválido, uso errado da API) viram log —
  // essencial pra depurar o que o JS pediu.
  desc.uncapturedErrorCallbackInfo.callback = logUncapturedError;
  WGPURequestDeviceCallbackInfo cb = WGPU_REQUEST_DEVICE_CALLBACK_INFO_INIT;
  cb.mode = WGPUCallbackMode_AllowProcessEvents;
  cb.userdata1 = &result;
  cb.callback = [](WGPURequestDeviceStatus status, WGPUDevice device,
                   WGPUStringView message, void* userdata1, void*) {
    auto* r = static_cast<DeviceResult*>(userdata1);
    if (status == WGPURequestDeviceStatus_Success) {
      r->device = device;
    } else {
      std::fprintf(stderr, "requestDevice: %.*s\n",
                   static_cast<int>(message.length), message.data);
    }
    r->done = true;
  };
  wgpuAdapterRequestDevice(adapter, &desc, cb);
  while (!result.done) wgpuInstanceProcessEvents(gpu->instance);
  return result.device;
}

// ── error scopes (o three embrulha criação de pipeline com eles) ───────────

napi_value devicePushErrorScope(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  auto* device =
      static_cast<WGPUDevice>(njs::unwrapThis(env, info, &argc, args));
  if (!device) return njs::undefined(env);
  std::string filter =
      argc >= 1 ? njs::toString(env, args[0]) : "validation";
  WGPUErrorFilter errorFilter = WGPUErrorFilter_Validation;
  if (filter == "out-of-memory") errorFilter = WGPUErrorFilter_OutOfMemory;
  else if (filter == "internal") errorFilter = WGPUErrorFilter_Internal;
  wgpuDevicePushErrorScope(device, errorFilter);
  return njs::undefined(env);
}

struct PopScopeResult {
  bool done = false;
  bool hasError = false;
  std::string message;
};

napi_value devicePopErrorScope(napi_env env, napi_callback_info info) {
  size_t argc = 0;
  auto* device =
      static_cast<WGPUDevice>(njs::unwrapThis(env, info, &argc, nullptr));
  HostGpu* gpu = gpuState();
  if (!device || !gpu) return njs::undefined(env);

  PopScopeResult result;
  WGPUPopErrorScopeCallbackInfo cb = WGPU_POP_ERROR_SCOPE_CALLBACK_INFO_INIT;
  cb.mode = WGPUCallbackMode_AllowProcessEvents;
  cb.userdata1 = &result;
  cb.callback = [](WGPUPopErrorScopeStatus, WGPUErrorType type,
                   WGPUStringView message, void* userdata1, void*) {
    auto* r = static_cast<PopScopeResult*>(userdata1);
    if (type != WGPUErrorType_NoError) {
      r->hasError = true;
      r->message.assign(message.data, message.length);
    }
    r->done = true;
  };
  wgpuDevicePopErrorScope(device, cb);
  while (!result.done) wgpuInstanceProcessEvents(gpu->instance);

  napi_value out = nullptr;
  if (result.hasError) {
    out = njs::makeObject(env);
    napi_value message = nullptr;
    napi_create_string_utf8(env, result.message.c_str(), NAPI_AUTO_LENGTH,
                            &message);
    napi_set_named_property(env, out, "message", message);
  } else {
    napi_get_null(env, &out);
  }
  return njs::resolvedPromise(env, out);
}

}  // namespace

napi_value makeDeviceObject(napi_env env, WGPUDevice device) {
  // device vive no HostGpu (o host libera no shutdown) — sem finalizer.
  napi_value obj = njs::wrapHandle(env, device, njs::finalizeNoop);
  // pipeline.cpp
  njs::setMethod(env, obj, "createShaderModule", deviceCreateShaderModule);
  njs::setMethod(env, obj, "createRenderPipeline", deviceCreateRenderPipeline);
  // layouts.cpp
  njs::setMethod(env, obj, "createBindGroupLayout",
                 deviceCreateBindGroupLayout);
  njs::setMethod(env, obj, "createPipelineLayout", deviceCreatePipelineLayout);
  // buffers.cpp
  njs::setMethod(env, obj, "createBuffer", deviceCreateBuffer);
  njs::setMethod(env, obj, "createBindGroup", deviceCreateBindGroup);
  // textures.cpp
  njs::setMethod(env, obj, "createTexture", deviceCreateTexture);
  njs::setMethod(env, obj, "createSampler", deviceCreateSampler);
  // commands.cpp
  njs::setMethod(env, obj, "createCommandEncoder", deviceCreateCommandEncoder);
  // error scopes (este arquivo)
  njs::setMethod(env, obj, "pushErrorScope", devicePushErrorScope);
  njs::setMethod(env, obj, "popErrorScope", devicePopErrorScope);

  napi_value queue = njs::makeObject(env);
  njs::setMethod(env, queue, "submit", queueSubmit);
  njs::setMethod(env, queue, "writeBuffer", queueWriteBuffer);
  napi_set_named_property(env, obj, "queue", queue);
  return obj;
}

napi_value adapterRequestDevice(napi_env env, napi_callback_info info) {
  size_t argc = 0;
  auto* adapter =
      static_cast<WGPUAdapter>(njs::unwrapThis(env, info, &argc, nullptr));
  HostGpu* gpu = gpuState();
  if (!adapter || !gpu) {
    njs::throwError(env, "requestDevice: adapter inválido");
    return njs::undefined(env);
  }
  if (!gpu->device) {
    WGPUDevice device = acquireDevice(gpu, adapter);
    if (!device) {
      njs::throwError(env, "requestDevice falhou");
      return njs::undefined(env);
    }
    gpu->device = device;
    gpu->queue = wgpuDeviceGetQueue(device);
  }
  return njs::resolvedPromise(env, makeDeviceObject(env, gpu->device));
}

}  // namespace webgpu
