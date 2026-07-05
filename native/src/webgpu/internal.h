// Contratos INTERNOS do módulo webgpu/ — callbacks Node-API repartidos entre
// os arquivos por responsabilidade:
//   navigator.cpp — navigator.gpu (requestAdapter, formato preferido)
//   device.cpp    — aquisição do device + composição do objeto JS `device`
//   pipeline.cpp  — shader modules e render pipelines (sub-parsers)
//   layouts.cpp   — bind group layouts e pipeline layouts explícitos
//   buffers.cpp   — GPUBuffer (write/map) e bind groups
//   textures.cpp  — GPUTexture, views e samplers
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

// pipeline.cpp
napi_value deviceCreateShaderModule(napi_env env, napi_callback_info info);
napi_value deviceCreateRenderPipeline(napi_env env, napi_callback_info info);

// commands.cpp
napi_value deviceCreateCommandEncoder(napi_env env, napi_callback_info info);
napi_value queueSubmit(napi_env env, napi_callback_info info);

// buffers.cpp — recursos de dados (GPUBuffer, bind groups)
napi_value deviceCreateBuffer(napi_env env, napi_callback_info info);
napi_value deviceCreateBindGroup(napi_env env, napi_callback_info info);
napi_value queueWriteBuffer(napi_env env, napi_callback_info info);
void registerBufferUsageGlobals(napi_env env);
// util compartilhado: bytes de TypedArray/ArrayBuffer (elementSize=1 pra AB)
bool getJsBytes(napi_env env, napi_value value, void** data, size_t* size,
                size_t* elementSize);

// textures.cpp — recursos de imagem (GPUTexture, views, samplers, upload)
napi_value deviceCreateTexture(napi_env env, napi_callback_info info);
napi_value deviceCreateSampler(napi_env env, napi_callback_info info);
napi_value makeTextureViewMethods(napi_env env, napi_value textureObj);
napi_value queueWriteTexture(napi_env env, napi_callback_info info);
napi_value queueCopyExternalImageToTexture(napi_env env,
                                           napi_callback_info info);

// layouts.cpp — layouts explícitos (o three não usa layout 'auto')
napi_value deviceCreateBindGroupLayout(napi_env env, napi_callback_info info);
napi_value deviceCreatePipelineLayout(napi_env env, napi_callback_info info);

// surface.cpp
napi_value contextConfigure(napi_env env, napi_callback_info info);
napi_value contextGetCurrentTexture(napi_env env, napi_callback_info info);

}  // namespace webgpu
