// Testes do mapa formato↔string (TDR-0004). Regressão direta do crash do
// SPEC-0155: o three pediu 'bc7-rgba-unorm-srgb', a string não estava no mapa
// e o wgpu panicou com "invalid texture format" — TODA string que o three
// emite nos caminhos do engine tem que resolver pra um enum válido.
#include "../src/webgpu/enums.h"
#include "harness.h"

namespace tests {

void testFormatFromString() {
  using webgpu::formatFromString;
  // Formatos que o engine/three realmente usam (superfície, RTs, sombra, BC).
  CHECK(formatFromString("bgra8unorm") == WGPUTextureFormat_BGRA8Unorm);
  CHECK(formatFromString("bgra8unorm-srgb") == WGPUTextureFormat_BGRA8UnormSrgb);
  CHECK(formatFromString("rgba8unorm") == WGPUTextureFormat_RGBA8Unorm);
  CHECK(formatFromString("rgba8unorm-srgb") == WGPUTextureFormat_RGBA8UnormSrgb);
  CHECK(formatFromString("rgba16float") == WGPUTextureFormat_RGBA16Float);
  CHECK(formatFromString("rg16float") == WGPUTextureFormat_RG16Float);
  CHECK(formatFromString("depth24plus") == WGPUTextureFormat_Depth24Plus);
  CHECK(formatFromString("depth32float") == WGPUTextureFormat_Depth32Float);
  // BC (SPEC-0155): o transcode KTX2 entrega BC7; o resto da família junto.
  CHECK(formatFromString("bc7-rgba-unorm") == WGPUTextureFormat_BC7RGBAUnorm);
  CHECK(formatFromString("bc7-rgba-unorm-srgb") == WGPUTextureFormat_BC7RGBAUnormSrgb);
  CHECK(formatFromString("bc1-rgba-unorm") == WGPUTextureFormat_BC1RGBAUnorm);
  CHECK(formatFromString("bc3-rgba-unorm-srgb") == WGPUTextureFormat_BC3RGBAUnormSrgb);
  CHECK(formatFromString("bc4-r-unorm") == WGPUTextureFormat_BC4RUnorm);
  CHECK(formatFromString("bc5-rg-unorm") == WGPUTextureFormat_BC5RGUnorm);
  // Desconhecido → Undefined (o chamador decide o erro; nunca um enum lixo).
  CHECK(formatFromString("nao-existe") == WGPUTextureFormat_Undefined);
  CHECK(formatFromString("") == WGPUTextureFormat_Undefined);
}

void testFormatToStringRoundtrip() {
  using webgpu::formatFromString;
  using webgpu::formatToString;
  // O formato exposto no JS precisa coincidir com a textura real, inclusive HDR.
  // Caso contrário, os bundles de mipmaps são incompatíveis com o alvo (SPEC-0281).
  const char* formats[] = {
    "bgra8unorm", "bgra8unorm-srgb", "rgba8unorm", "rgba8unorm-srgb",
    "rgba16float", "rgba32float", "r8unorm", "r16float", "r32float", "rg16float",
    "bc7-rgba-unorm", "bc7-rgba-unorm-srgb", "bc1-rgba-unorm", "bc1-rgba-unorm-srgb",
    "bc3-rgba-unorm", "bc3-rgba-unorm-srgb", "bc4-r-unorm", "bc5-rg-unorm",
    "depth16unorm", "depth24plus", "depth24plus-stencil8", "depth32float",
  };
  for (const char* name : formats) {
    const auto format = formatFromString(name);
    CHECK(std::string(formatToString(format)) == name);
    CHECK(formatFromString(formatToString(format)) == format);
  }
}

}  // namespace tests
