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

#include <node_api.h>

#include "../core/host_gpu.h"

namespace webgpu {

// Estado compartilhado do módulo (definido em navigator.cpp).
HostGpu* gpuState();

// destroy() de buffers/texturas = DESTRUIÇÃO ADIADA (buffers.cpp, ADR-0153):
// enfileira com AddRef e o flush do loop executa Destroy+Release N frames
// depois — fora da janela de passes em voo que fazia o destroy imediato dar
// PANIC ("has been destroyed"). O release-only anterior deixava a VRAM presa
// (refs internas do wgpu) — ~770 MB por troca de fase, medido no soak.
void deferDestroyBuffer(WGPUBuffer buffer);
void deferDestroyTexture(WGPUTexture texture);
// Telemetria de VRAM (ADR-0153): criação × destroy × finalizer de
// buffers/texturas — o delta aponta a classe de recurso que vaza. Quieta por
// padrão; `CORTEX_VRAM_LOG=1` liga a impressão periódica no loop.
void countFinalizedBuffer();
void countFinalizedTexture();
void countCreatedBuffer(uint64_t bytes);
void countCreatedTexture();
// Registro de texturas VIVAS (criada − destruída) com dimensões, pra apontar
// exatamente QUAIS texturas vazam por ciclo. Dump das maiores no telemetry.
void trackTextureCreated(WGPUTexture texture, uint32_t width, uint32_t height,
                         uint32_t depth, uint32_t mips, uint32_t sampleCount,
                         const char* format);
void trackTextureDestroyed(WGPUTexture texture);
void dumpAliveTextures();

// navigator.cpp
napi_value gpuRequestAdapter(napi_env env, napi_callback_info info);
napi_value gpuGetPreferredCanvasFormat(napi_env env, napi_callback_info info);

// device.cpp
napi_value adapterRequestDevice(napi_env env, napi_callback_info info);
napi_value makeDeviceObject(napi_env env, WGPUDevice device);

// pipeline.cpp
napi_value deviceCreateShaderModule(napi_env env, napi_callback_info info);
napi_value deviceCreateRenderPipeline(napi_env env, napi_callback_info info);
napi_value deviceCreateRenderPipelineAsync(napi_env env,
                                           napi_callback_info info);
napi_value deviceCreateComputePipeline(napi_env env, napi_callback_info info);
napi_value deviceCreateComputePipelineAsync(napi_env env,
                                            napi_callback_info info);

// commands.cpp
napi_value deviceCreateCommandEncoder(napi_env env, napi_callback_info info);
napi_value queueSubmit(napi_env env, napi_callback_info info);
napi_value queueOnSubmittedWorkDone(napi_env env, napi_callback_info info);
napi_value deviceCreateRenderBundleEncoder(napi_env env,
                                           napi_callback_info info);

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
// parsers compartilhados de cópia (usados também pelo commands.cpp)
WGPUTexelCopyTextureInfo parseCopyTexture(napi_env env, napi_value value);
WGPUExtent3D parseCopyExtent(napi_env env, napi_value value);

// layouts.cpp — layouts explícitos (o three não usa layout 'auto')
napi_value deviceCreateBindGroupLayout(napi_env env, napi_callback_info info);
napi_value deviceCreatePipelineLayout(napi_env env, napi_callback_info info);

// surface.cpp
napi_value contextConfigure(napi_env env, napi_callback_info info);
napi_value contextGetCurrentTexture(napi_env env, napi_callback_info info);
// Adquire a textura da swapchain (auto-configura a surface na 1ª vez). Devolve
// nullptr se a surface estiver indisponível no frame. Usada pelo present e pela
// splash (splash.cpp), que apresenta um frame próprio por cima.
WGPUTexture acquireSurfaceTexture(HostGpu* gpu);

}  // namespace webgpu
