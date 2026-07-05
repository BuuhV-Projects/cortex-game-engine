// Contratos INTERNOS do módulo webgpu/ — callbacks Node-API repartidos entre
// os arquivos por responsabilidade:
//   navigator.cpp — navigator.gpu (requestAdapter, formato preferido)
//   device.cpp    — device + fábricas (shader module, pipeline, encoder)
//   commands.cpp  — encoder/render pass/queue.submit
//   surface.cpp   — gpuContext (configure, getCurrentTexture) e present
//   enums.*       — mapas string ↔ enum do WebGPU
// Fora do módulo, use apenas bindings.h.
#pragma once

#include <hermes/hermes_api.h>

#include "../core/host_gpu.h"

namespace webgpu {

// Estado compartilhado do módulo (definido em navigator.cpp).
HostGpu* gpuState();

// navigator.cpp
napi_value gpuRequestAdapter(napi_env env, napi_callback_info info);
napi_value gpuGetPreferredCanvasFormat(napi_env env, napi_callback_info info);

// device.cpp
napi_value adapterRequestDevice(napi_env env, napi_callback_info info);
napi_value makeDeviceObject(napi_env env, WGPUDevice device);

// commands.cpp
napi_value deviceCreateCommandEncoder(napi_env env, napi_callback_info info);
napi_value queueSubmit(napi_env env, napi_callback_info info);

// buffers.cpp — recursos de dados (GPUBuffer, bind groups)
napi_value deviceCreateBuffer(napi_env env, napi_callback_info info);
napi_value deviceCreateBindGroup(napi_env env, napi_callback_info info);
napi_value queueWriteBuffer(napi_env env, napi_callback_info info);
void registerBufferUsageGlobals(napi_env env);

// surface.cpp
napi_value contextConfigure(napi_env env, napi_callback_info info);
napi_value contextGetCurrentTexture(napi_env env, napi_callback_info info);

}  // namespace webgpu
