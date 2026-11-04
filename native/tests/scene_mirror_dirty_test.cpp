// Testes do "sujo de verdade" do espelho de cena (SPEC-0678).
#include <cmath>
#include <vector>

#include "../src/scene/scene_mirror.h"
#include "harness.h"

namespace {

using scene::kNoParent;
using scene::kSyncFloatsPerNode;
using scene::NodeDesc;
using scene::SceneMirror;

std::vector<float> planosQueNaoCortam() {
  std::vector<float> planos(scene::kFrustumPlanes * 4, 0.0f);
  for (int i = 0; i < scene::kFrustumPlanes; i++) {
    planos[static_cast<size_t>(i) * 4 + 1] = 1.0f;
    planos[static_cast<size_t>(i) * 4 + 3] = 1.0e6f;
  }
  return planos;
}

const float kIdentidade[16] = {1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1};

/** Raiz → pai (x = 2) → filho (y = 1), já atualizados uma vez. */
SceneMirror cadeiaAtualizada(const std::vector<float>& planos) {
  std::vector<NodeDesc> nos(3);
  nos[0].parent = kNoParent;
  nos[1].parent = 0;
  nos[1].transform.px = 2.0f;
  nos[2].parent = 1;
  nos[2].transform.py = 1.0f;
  SceneMirror espelho;
  espelho.build(nos);
  espelho.updateAndCull(kIdentidade, planos.data());
  return espelho;
}

/** Linha de sync do nó 1 com posição `x` e as flags de visível. */
std::vector<double> linhaDoPai(double x) {
  std::vector<double> linha(kSyncFloatsPerNode, 0.0);
  linha[0] = 1;
  linha[1] = x;
  linha[7] = 1;
  linha[8] = linha[9] = linha[10] = 1;
  linha[scene::kSyncFlags] = scene::kSyncVisible | scene::kSyncMaterialVisible;
  return linha;
}

}  // namespace

namespace tests {

void testSceneMirrorLinhaIgualNaoPropaga() {
  // O `three` reescreve rotação igual todo quadro e cada linha assim
  // recompunha a subárvore. Linha igual = slot limpo, nada muda (SPEC-0678).
  const auto planos = planosQueNaoCortam();
  SceneMirror espelho = cadeiaAtualizada(planos);
  const auto igual = linhaDoPai(2.0);
  espelho.applyTransforms(igual.data(), igual.size());
  espelho.updateAndCull(kIdentidade, planos.data());
  CHECK(espelho.changedThisFrame().empty());
  CHECK(std::fabs(espelho.worldMatrix(2)[12] - 2.0) < 1e-9);
  CHECK(std::fabs(espelho.worldMatrix(2)[13] - 1.0) < 1e-9);
}

void testSceneMirrorLinhaDiferentePropagaParaOsFilhos() {
  const auto planos = planosQueNaoCortam();
  SceneMirror espelho = cadeiaAtualizada(planos);
  const auto andou = linhaDoPai(5.0);
  espelho.applyTransforms(andou.data(), andou.size());
  espelho.updateAndCull(kIdentidade, planos.data());
  CHECK(espelho.changedThisFrame().size() == 2);  // o pai e o filho
  CHECK(std::fabs(espelho.worldMatrix(2)[12] - 5.0) < 1e-9);
}

void testSceneMirrorLinhaIgualAindaAplicaAsFlags() {
  // A linha que só muda o `visible` não recompõe nada, mas a flag vale.
  const auto planos = planosQueNaoCortam();
  SceneMirror espelho = cadeiaAtualizada(planos);
  auto oculto = linhaDoPai(2.0);
  oculto[scene::kSyncFlags] = scene::kSyncMaterialVisible;
  espelho.applyTransforms(oculto.data(), oculto.size());
  espelho.updateAndCull(kIdentidade, planos.data());
  CHECK(!espelho.visibleFlag(1));
  CHECK(espelho.changedThisFrame().empty());
}

}  // namespace tests
