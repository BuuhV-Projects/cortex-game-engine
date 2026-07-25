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
  // Os formatos com toString definido fazem ida-e-volta.
  CHECK(formatFromString(formatToString(WGPUTextureFormat_BGRA8Unorm)) == WGPUTextureFormat_BGRA8Unorm);
  CHECK(formatFromString(formatToString(WGPUTextureFormat_RGBA8UnormSrgb)) == WGPUTextureFormat_RGBA8UnormSrgb);
}

}  // namespace tests
