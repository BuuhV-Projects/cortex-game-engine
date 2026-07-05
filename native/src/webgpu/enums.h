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

}  // namespace webgpu
