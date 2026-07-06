// Mapas string ↔ enum da API WebGPU (os literais que o JS usa, ex.
// 'bgra8unorm', 'triangle-list') pro equivalente do webgpu.h.
#pragma once

#include <webgpu/webgpu.h>

#include <string>

namespace webgpu {

WGPUTextureFormat formatFromString(const std::string& s);
const char* formatToString(WGPUTextureFormat format);
WGPULoadOp loadOpFromString(const std::string& s);
WGPUStoreOp storeOpFromString(const std::string& s);
WGPUPrimitiveTopology topologyFromString(const std::string& s);
WGPUVertexFormat vertexFormatFromString(const std::string& s);
WGPUCompareFunction compareFromString(const std::string& s);
WGPUCullMode cullModeFromString(const std::string& s);
WGPUFrontFace frontFaceFromString(const std::string& s);
WGPUIndexFormat indexFormatFromString(const std::string& s);
WGPUVertexStepMode stepModeFromString(const std::string& s);
WGPUTextureViewDimension viewDimensionFromString(const std::string& s);
WGPUTextureAspect aspectFromString(const std::string& s);
WGPUFilterMode filterModeFromString(const std::string& s);
WGPUMipmapFilterMode mipmapFilterFromString(const std::string& s);
WGPUAddressMode addressModeFromString(const std::string& s);
WGPUBlendFactor blendFactorFromString(const std::string& s);
WGPUBlendOperation blendOperationFromString(const std::string& s);

}  // namespace webgpu
