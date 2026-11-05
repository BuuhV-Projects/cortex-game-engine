// Uniformes por caster do passe de sombra nativo (SPEC-0245, SPEC-0642, SPEC-0690).
//
// Os slots de uma cascata são contíguos (0..n-1, `assignShadowSlots`), então o
// passe monta todos num staging reaproveitado e manda UMA escrita por cascata.
// Uma `wgpuQueueWriteBuffer` por caster (~200 por cascata) custava mais CPU que
// o resto do passe; a escrita única tem o mesmo efeito na fila, porque nenhum
// draw da cascata é gravado antes dela. Puro: o harness testa sem GPU.
#pragma once

#include <cstddef>
#include <cstdint>
#include <vector>

#include "alpha_clip_table.h"
#include "shadow_math.h"

namespace render {

/** Alinhamento que o WebGPU exige para offset dinâmico de uniforme. */
constexpr uint64_t kUniformSlotAlign = 256;
/** `mat3x3f` no WGSL: 3 colunas de `vec4f` (o 4º float é preenchimento). */
constexpr uint32_t kUvColumns = 3;
constexpr uint32_t kUvColumnFloats = 4;
/** Linhas úteis de cada coluna da `Matrix3` do `three`. */
constexpr uint32_t kUvRows = 3;
/** Floats de preenchimento depois de `alphaTest` (o struct fecha em 256 bytes). */
constexpr uint32_t kUniformPadding = 3;

/**
 * Uniforme por caster: as três matrizes de {@link ShadowCasterMatrices} mais o
 * recorte alfa (SPEC-0642) — `uvTransform` em 3 colunas `vec4f` (o `mat3x3f` do
 * WGSL) e `alphaTest`. Ocupa o slot inteiro; as variantes depth-only só leem as
 * matrizes.
 */
struct ShadowCasterUniforms {
  ShadowCasterMatrices matrices;
  float uvTransform[kUvColumns * kUvColumnFloats];
  float alphaTest;
  float padding[kUniformPadding];
};
static_assert(sizeof(ShadowCasterUniforms) == kUniformSlotAlign,
              "o uniforme do caster tem de casar com o struct do WGSL");

/** Monta o uniforme de um caster: matrizes da cascata × `model` e o recorte, se houver. */
void composeShadowUniform(ShadowCasterUniforms& u, const double viewProjection[16], const double* projection,
                          const double* view, const double model[16], const AlphaClipEntry* recorte);

/** Os uniformes de uma cascata, montados por slot e mandados numa escrita só. */
class ShadowUniformStaging {
 public:
  /** Começa uma cascata: nenhum slot escrito (a memória fica, sem realocar). */
  void reset() { used_ = 0; }

  /** O uniforme do slot `slot`, crescendo o staging se preciso. */
  ShadowCasterUniforms& at(uint32_t slot);

  /** Slots usados nesta cascata (o maior escrito + 1): o tamanho da escrita. */
  uint32_t used() const { return used_; }
  const ShadowCasterUniforms* data() const { return slots_.data(); }
  size_t bytes() const { return static_cast<size_t>(used_) * sizeof(ShadowCasterUniforms); }

 private:
  std::vector<ShadowCasterUniforms> slots_;
  uint32_t used_ = 0;
};

}  // namespace render
