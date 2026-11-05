// Ver shadow_pass_status.h (SPEC-0690, item 3).
#include "shadow_pass_status.h"

namespace render {
namespace {

/** Passos por caster no roteiro: escrever o uniforme e desenhar. */
constexpr size_t kStepsPerCaster = 2;
/** Passos fixos de um pass: abrir e submeter. */
constexpr size_t kPassFrameSteps = 2;

}  // namespace

ShadowPassStatus classifyShadowPass(uint32_t total, uint32_t missingGeometry,
                                    uint32_t emptyInstances) {
  if (total == 0) return ShadowPassStatus::kClearedEmpty;
  // Antes do vazio: um item sem geometria pode ser justamente o que projetaria
  // a sombra, e limpar o alvo a apagaria.
  if (missingGeometry > 0) return ShadowPassStatus::kNotReady;
  if (emptyInstances >= total) return ShadowPassStatus::kClearedEmpty;
  return ShadowPassStatus::kOk;
}

bool shadowPassWritesTarget(ShadowPassStatus status) {
  return status == ShadowPassStatus::kOk || status == ShadowPassStatus::kClearedEmpty;
}

std::vector<ShadowPassStep> planShadowPass(ShadowPassStatus status, uint32_t drawable) {
  std::vector<ShadowPassStep> plano;
  if (status == ShadowPassStatus::kClearedEmpty) {
    plano = {ShadowPassStep::kOpen, ShadowPassStep::kSubmit};
  } else if (status == ShadowPassStatus::kOk) {
    plano.reserve(static_cast<size_t>(drawable) * kStepsPerCaster + kPassFrameSteps);
    plano.push_back(ShadowPassStep::kOpen);
    plano.insert(plano.end(), drawable, ShadowPassStep::kWriteUniform);
    plano.insert(plano.end(), drawable, ShadowPassStep::kDraw);
    plano.push_back(ShadowPassStep::kSubmit);
  }
  return plano;
}

uint32_t assignShadowSlots(const uint32_t* instanceCounts, uint32_t total,
                           std::vector<uint32_t>& out) {
  out.assign(total, kNoShadowSlot);
  uint32_t proximo = 0;
  for (uint32_t i = 0; i < total; ++i) {
    if (instanceCounts[i] != 0) out[i] = proximo++;
  }
  return proximo;
}

ShadowItemFate shadowItemFate(const ShadowItemFacts& facts) {
  if (!facts.hasGeometry) return ShadowItemFate::kSkipped;
  if (facts.instanced) {
    if (!facts.batchFound) return ShadowItemFate::kSkipped;
    if (facts.batchCount == 0) return ShadowItemFate::kEmpty;
  }
  if (facts.alphaClip && !facts.alphaClipFound) return ShadowItemFate::kSkipped;
  return ShadowItemFate::kDraw;
}

}  // namespace render
