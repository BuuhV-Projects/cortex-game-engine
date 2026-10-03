// Transcode KTX2/Basis → BC7 (todos os mips, SPEC-0155) ou RGBA32 (mip 0) —
// função PURA, sem NAPI: roda na thread JS (binding síncrono) ou num worker do
// io_pool (binding assíncrono, SPEC-0287). Thread-safe: cada chamada usa seu
// próprio ktx2_transcoder; a init global do basis roda 1× (std::call_once).
#pragma once

#include <cstddef>
#include <cstdint>
#include <vector>

namespace shims {

struct Ktx2Image {
  uint32_t width = 0;
  uint32_t height = 0;
  bool bc7 = false;                          // true: `levels`; false: `rgba`
  std::vector<std::vector<uint8_t>> levels;  // mips BC7, do 0 ao menor
  std::vector<uint8_t> rgba;                 // fallback RGBA32, mip 0
};

// false = bytes inválidos ou transcode falhou (BC7 e RGBA).
bool transcodeKtx2(const uint8_t* bytes, size_t size, Ktx2Image& out);

}  // namespace shims
