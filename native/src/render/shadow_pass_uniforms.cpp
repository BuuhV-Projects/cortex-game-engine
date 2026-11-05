// Ver shadow_pass_uniforms.h (SPEC-0690).
#include "shadow_pass_uniforms.h"

namespace render {

void composeShadowUniform(ShadowCasterUniforms& u, const double viewProjection[16], const double* projection,
                          const double* view, const double model[16], const AlphaClipEntry* recorte) {
  u = {};
  shadowCasterMatrices(viewProjection, projection, view, model, u.matrices);
  u.alphaTest = recorte ? recorte->alphaTest : 0.0f;
  for (uint32_t c = 0; c < kUvColumns; ++c) {
    for (uint32_t l = 0; l < kUvRows; ++l) {
      u.uvTransform[c * kUvColumnFloats + l] = recorte ? recorte->uvTransform[c * kUvRows + l] : 0.0f;
    }
  }
}

ShadowCasterUniforms& ShadowUniformStaging::at(uint32_t slot) {
  if (slot >= slots_.size()) slots_.resize(static_cast<size_t>(slot) + 1);
  if (slot >= used_) used_ = slot + 1;
  return slots_[slot];
}

}  // namespace render
