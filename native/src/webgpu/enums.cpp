#include "enums.h"

namespace webgpu {

WGPUTextureFormat formatFromString(const std::string& s) {
  if (s == "bgra8unorm") return WGPUTextureFormat_BGRA8Unorm;
  if (s == "bgra8unorm-srgb") return WGPUTextureFormat_BGRA8UnormSrgb;
  if (s == "rgba8unorm") return WGPUTextureFormat_RGBA8Unorm;
  if (s == "rgba8unorm-srgb") return WGPUTextureFormat_RGBA8UnormSrgb;
  if (s == "rgba16float") return WGPUTextureFormat_RGBA16Float;
  if (s == "rgba32float") return WGPUTextureFormat_RGBA32Float;
  if (s == "r8unorm") return WGPUTextureFormat_R8Unorm;
  if (s == "r16float") return WGPUTextureFormat_R16Float;
  if (s == "r32float") return WGPUTextureFormat_R32Float;
  if (s == "rg16float") return WGPUTextureFormat_RG16Float;
  if (s == "depth16unorm") return WGPUTextureFormat_Depth16Unorm;
  if (s == "depth24plus") return WGPUTextureFormat_Depth24Plus;
  if (s == "depth24plus-stencil8")
    return WGPUTextureFormat_Depth24PlusStencil8;
  if (s == "depth32float") return WGPUTextureFormat_Depth32Float;
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
  if (s == "uint32x2") return WGPUVertexFormat_Uint32x2;
  if (s == "uint32x3") return WGPUVertexFormat_Uint32x3;
  if (s == "uint32x4") return WGPUVertexFormat_Uint32x4;
  if (s == "sint32") return WGPUVertexFormat_Sint32;
  if (s == "sint32x2") return WGPUVertexFormat_Sint32x2;
  if (s == "sint32x3") return WGPUVertexFormat_Sint32x3;
  if (s == "sint32x4") return WGPUVertexFormat_Sint32x4;
  if (s == "uint16x2") return WGPUVertexFormat_Uint16x2;
  if (s == "uint16x4") return WGPUVertexFormat_Uint16x4;
  if (s == "sint16x2") return WGPUVertexFormat_Sint16x2;
  if (s == "sint16x4") return WGPUVertexFormat_Sint16x4;
  if (s == "unorm16x2") return WGPUVertexFormat_Unorm16x2;
  if (s == "unorm16x4") return WGPUVertexFormat_Unorm16x4;
  if (s == "snorm16x2") return WGPUVertexFormat_Snorm16x2;
  if (s == "snorm16x4") return WGPUVertexFormat_Snorm16x4;
  if (s == "float16x2") return WGPUVertexFormat_Float16x2;
  if (s == "float16x4") return WGPUVertexFormat_Float16x4;
  if (s == "uint8x2") return WGPUVertexFormat_Uint8x2;
  if (s == "uint8x4") return WGPUVertexFormat_Uint8x4;
  if (s == "sint8x2") return WGPUVertexFormat_Sint8x2;
  if (s == "sint8x4") return WGPUVertexFormat_Sint8x4;
  if (s == "unorm8x2") return WGPUVertexFormat_Unorm8x2;
  if (s == "unorm8x4") return WGPUVertexFormat_Unorm8x4;
  if (s == "snorm8x2") return WGPUVertexFormat_Snorm8x2;
  if (s == "snorm8x4") return WGPUVertexFormat_Snorm8x4;
  return WGPUVertexFormat_Float32x3;
}

WGPUCompareFunction compareFromString(const std::string& s) {
  if (s == "never") return WGPUCompareFunction_Never;
  if (s == "less") return WGPUCompareFunction_Less;
  if (s == "equal") return WGPUCompareFunction_Equal;
  if (s == "less-equal") return WGPUCompareFunction_LessEqual;
  if (s == "greater") return WGPUCompareFunction_Greater;
  if (s == "not-equal") return WGPUCompareFunction_NotEqual;
  if (s == "greater-equal") return WGPUCompareFunction_GreaterEqual;
  if (s == "always") return WGPUCompareFunction_Always;
  return WGPUCompareFunction_Undefined;
}

WGPUCullMode cullModeFromString(const std::string& s) {
  if (s == "front") return WGPUCullMode_Front;
  if (s == "back") return WGPUCullMode_Back;
  return WGPUCullMode_None;
}

WGPUFrontFace frontFaceFromString(const std::string& s) {
  if (s == "cw") return WGPUFrontFace_CW;
  return WGPUFrontFace_CCW;
}

WGPUIndexFormat indexFormatFromString(const std::string& s) {
  if (s == "uint16") return WGPUIndexFormat_Uint16;
  return WGPUIndexFormat_Uint32;
}

WGPUVertexStepMode stepModeFromString(const std::string& s) {
  if (s == "instance") return WGPUVertexStepMode_Instance;
  return WGPUVertexStepMode_Vertex;
}

WGPUTextureViewDimension viewDimensionFromString(const std::string& s) {
  if (s == "1d") return WGPUTextureViewDimension_1D;
  if (s == "2d") return WGPUTextureViewDimension_2D;
  if (s == "2d-array") return WGPUTextureViewDimension_2DArray;
  if (s == "cube") return WGPUTextureViewDimension_Cube;
  if (s == "cube-array") return WGPUTextureViewDimension_CubeArray;
  if (s == "3d") return WGPUTextureViewDimension_3D;
  return WGPUTextureViewDimension_Undefined;
}

WGPUTextureAspect aspectFromString(const std::string& s) {
  if (s == "stencil-only") return WGPUTextureAspect_StencilOnly;
  if (s == "depth-only") return WGPUTextureAspect_DepthOnly;
  return WGPUTextureAspect_All;
}

WGPUFilterMode filterModeFromString(const std::string& s) {
  if (s == "linear") return WGPUFilterMode_Linear;
  return WGPUFilterMode_Nearest;
}

WGPUMipmapFilterMode mipmapFilterFromString(const std::string& s) {
  if (s == "linear") return WGPUMipmapFilterMode_Linear;
  return WGPUMipmapFilterMode_Nearest;
}

WGPUAddressMode addressModeFromString(const std::string& s) {
  if (s == "repeat") return WGPUAddressMode_Repeat;
  if (s == "mirror-repeat") return WGPUAddressMode_MirrorRepeat;
  return WGPUAddressMode_ClampToEdge;
}

WGPUBlendFactor blendFactorFromString(const std::string& s) {
  if (s == "zero") return WGPUBlendFactor_Zero;
  if (s == "one") return WGPUBlendFactor_One;
  if (s == "src") return WGPUBlendFactor_Src;
  if (s == "one-minus-src") return WGPUBlendFactor_OneMinusSrc;
  if (s == "src-alpha") return WGPUBlendFactor_SrcAlpha;
  if (s == "one-minus-src-alpha") return WGPUBlendFactor_OneMinusSrcAlpha;
  if (s == "dst") return WGPUBlendFactor_Dst;
  if (s == "one-minus-dst") return WGPUBlendFactor_OneMinusDst;
  if (s == "dst-alpha") return WGPUBlendFactor_DstAlpha;
  if (s == "one-minus-dst-alpha") return WGPUBlendFactor_OneMinusDstAlpha;
  if (s == "src-alpha-saturated") return WGPUBlendFactor_SrcAlphaSaturated;
  if (s == "constant") return WGPUBlendFactor_Constant;
  if (s == "one-minus-constant") return WGPUBlendFactor_OneMinusConstant;
  return WGPUBlendFactor_One;
}

WGPUBlendOperation blendOperationFromString(const std::string& s) {
  if (s == "subtract") return WGPUBlendOperation_Subtract;
  if (s == "reverse-subtract") return WGPUBlendOperation_ReverseSubtract;
  if (s == "min") return WGPUBlendOperation_Min;
  if (s == "max") return WGPUBlendOperation_Max;
  return WGPUBlendOperation_Add;
}

WGPUPrimitiveTopology topologyFromString(const std::string& s) {
  if (s == "point-list") return WGPUPrimitiveTopology_PointList;
  if (s == "line-list") return WGPUPrimitiveTopology_LineList;
  if (s == "line-strip") return WGPUPrimitiveTopology_LineStrip;
  if (s == "triangle-strip") return WGPUPrimitiveTopology_TriangleStrip;
  return WGPUPrimitiveTopology_TriangleList;
}

}  // namespace webgpu
