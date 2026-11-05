// Testes do staging dos uniformes do passe de sombra (SPEC-0690).
//
// O passe manda os uniformes de uma cascata numa escrita so: o staging tem de
// cobrir exatamente os slots 0..n-1 da cascata, recomecar a cada cascata sem
// realocar, e cada slot tem de sair com o recorte do caster dele.
#include "../src/render/shadow_pass_uniforms.h"

#include "harness.h"

namespace {

using render::AlphaClipEntry;
using render::composeShadowUniform;
using render::ShadowCasterUniforms;
using render::ShadowUniformStaging;

/** Identidade 4x4 em coluna, como o `three`. */
constexpr double kIdentity[16] = {1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1};
constexpr float kAlphaTest = 0.5f;
constexpr uint32_t kCascadeA = 3;
constexpr uint32_t kCascadeB = 2;

}  // namespace

namespace tests {

void testShadowUniformStagingCobreOsSlotsDaCascata() {
  ShadowUniformStaging staging;
  for (uint32_t slot = 0; slot < kCascadeA; ++slot) staging.at(slot);
  CHECK(staging.used() == kCascadeA);
  CHECK(staging.bytes() == kCascadeA * sizeof(ShadowCasterUniforms));
  // A cascata seguinte, menor, reaproveita a memoria e manda so os slots dela.
  const ShadowCasterUniforms* antes = staging.data();
  staging.reset();
  CHECK(staging.used() == 0);
  for (uint32_t slot = 0; slot < kCascadeB; ++slot) staging.at(slot);
  CHECK(staging.used() == kCascadeB);
  CHECK(staging.data() == antes);
}

void testShadowUniformLevaORecorteDoCaster() {
  AlphaClipEntry recorte;
  recorte.alphaTest = kAlphaTest;
  recorte.uvTransform[0] = 2.0f;
  ShadowUniformStaging staging;
  composeShadowUniform(staging.at(0), kIdentity, nullptr, nullptr, kIdentity, &recorte);
  composeShadowUniform(staging.at(1), kIdentity, nullptr, nullptr, kIdentity, nullptr);
  CHECK(staging.data()[0].alphaTest == kAlphaTest);
  CHECK(staging.data()[0].uvTransform[0] == 2.0f);
  // Sem recorte o slot sai zerado: um caster opaco nunca herda o recorte do vizinho.
  CHECK(staging.data()[1].alphaTest == 0.0f);
  CHECK(staging.data()[1].uvTransform[0] == 0.0f);
}

}  // namespace tests
