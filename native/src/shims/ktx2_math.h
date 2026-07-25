// Matemática de blocos BC7 (SPEC-0155/TDR-0004) — PURA, sem dependência de
// basis/wgpu/NAPI, pra ser usada pelo transcoder (ktx2.cpp) e testada isolada
// (cortex_host_tests). BC7 comprime em blocos 4×4 de 16 bytes.
#pragma once

#include <cstddef>
#include <cstdint>

namespace shims {

/** Bytes por bloco 4×4 no BC7. */
constexpr uint32_t kBc7BytesPerBlock = 16;

/** Dimensão de um nível de mip (nunca abaixo de 1). */
constexpr uint32_t mipDim(uint32_t base, uint32_t level) {
  return (base >> level) != 0 ? (base >> level) : 1u;
}

/** Blocos 4×4 ao longo de uma dimensão (arredonda pra cima). */
constexpr uint32_t bc7BlocksAcross(uint32_t dim) {
  return (dim + 3u) / 4u;
}

/** Blocos totais de um nível de mip `level` de uma textura `w`×`h`. */
constexpr uint32_t bc7BlocksPerLevel(uint32_t w, uint32_t h, uint32_t level) {
  return bc7BlocksAcross(mipDim(w, level)) * bc7BlocksAcross(mipDim(h, level));
}

/** Tamanho em bytes de um nível de mip BC7 de uma textura `w`×`h`. */
constexpr size_t bc7LevelByteSize(uint32_t w, uint32_t h, uint32_t level) {
  return static_cast<size_t>(bc7BlocksPerLevel(w, h, level)) * kBc7BytesPerBlock;
}

}  // namespace shims
