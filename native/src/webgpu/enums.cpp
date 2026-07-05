#include "enums.h"

namespace webgpu {

WGPUTextureFormat formatFromString(const std::string& s) {
  if (s == "bgra8unorm") return WGPUTextureFormat_BGRA8Unorm;
  if (s == "bgra8unorm-srgb") return WGPUTextureFormat_BGRA8UnormSrgb;
  if (s == "rgba8unorm") return WGPUTextureFormat_RGBA8Unorm;
  if (s == "rgba8unorm-srgb") return WGPUTextureFormat_RGBA8UnormSrgb;
  if (s == "rgba16float") return WGPUTextureFormat_RGBA16Float;
  return WGPUTextureFormat_Undefined;
}

const char* formatToString(WGPUTextureFormat format) {
  switch (format) {
    case WGPUTextureFormat_BGRA8Unorm: return "bgra8unorm";
    case WGPUTextureFormat_BGRA8UnormSrgb: return "bgra8unorm-srgb";
    case WGPUTextureFormat_RGBA8Unorm: return "rgba8unorm";
    case WGPUTextureFormat_RGBA8UnormSrgb: return "rgba8unorm-srgb";
    default: return "bgra8unorm";
  }
}

WGPULoadOp loadOpFromString(const std::string& s) {
  if (s == "load") return WGPULoadOp_Load;
  return WGPULoadOp_Clear;
}

WGPUStoreOp storeOpFromString(const std::string& s) {
  if (s == "discard") return WGPUStoreOp_Discard;
  return WGPUStoreOp_Store;
}

WGPUVertexFormat vertexFormatFromString(const std::string& s) {
  if (s == "float32") return WGPUVertexFormat_Float32;
  if (s == "float32x2") return WGPUVertexFormat_Float32x2;
  if (s == "float32x3") return WGPUVertexFormat_Float32x3;
  if (s == "float32x4") return WGPUVertexFormat_Float32x4;
  if (s == "uint32") return WGPUVertexFormat_Uint32;
  if (s == "sint32") return WGPUVertexFormat_Sint32;
  return WGPUVertexFormat_Float32x3;
}

WGPUPrimitiveTopology topologyFromString(const std::string& s) {
  if (s == "point-list") return WGPUPrimitiveTopology_PointList;
  if (s == "line-list") return WGPUPrimitiveTopology_LineList;
  if (s == "line-strip") return WGPUPrimitiveTopology_LineStrip;
  if (s == "triangle-strip") return WGPUPrimitiveTopology_TriangleStrip;
  return WGPUPrimitiveTopology_TriangleList;
}

}  // namespace webgpu
