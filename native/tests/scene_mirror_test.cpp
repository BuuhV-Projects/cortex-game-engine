// Testes do espelho de cena (SPEC-0233).
#include "../src/scene/scene_mirror.h"

#include <cmath>
#include <vector>

#include "harness.h"

namespace {

using scene::kNoParent;
using scene::kSyncFloatsPerNode;
using scene::NodeDesc;
using scene::SceneMirror;

/** Planos de um frustum enorme — nada é cortado. */
std::vector<float> planosAmplos() {
  std::vector<float> planos(scene::kFrustumPlanes * 4, 0.0f);
  for (int i = 0; i < scene::kFrustumPlanes; i++) {
    planos[static_cast<size_t>(i) * 4] = 0.0f;
    planos[static_cast<size_t>(i) * 4 + 1] = 1.0f;
    planos[static_cast<size_t>(i) * 4 + 2] = 0.0f;
    planos[static_cast<size_t>(i) * 4 + 3] = 1.0e6f;
  }
  return planos;
}

float identidade[16] = {1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1};

}  // namespace

namespace tests {

void testSceneMirrorPropagaTransformDoPai() {
  // O filho não mexe no transform local, mas precisa acompanhar o pai — é o
  // caso do carro inteiro se movendo com as peças paradas, que é 95% da cena.
  std::vector<NodeDesc> nos(2);
  nos[0].parent = kNoParent;
  nos[1].parent = 0;
  nos[1].transform.py = 1.0f;

  SceneMirror espelho;
  CHECK(espelho.build(nos));

  const double mover[kSyncFloatsPerNode] = {0, 10, 0, 0, 0, 0, 0, 1, 1, 1, 1};
  espelho.applyTransforms(mover, kSyncFloatsPerNode);
  const auto planos = planosAmplos();
  espelho.updateAndCull(identidade, planos.data());

  const double* mundoDoFilho = espelho.worldMatrix(1);
  CHECK(std::fabs(mundoDoFilho[12] - 10.0) < 1e-9);
  CHECK(std::fabs(mundoDoFilho[13] - 1.0) < 1e-9);
}

void testSceneMirrorRecusaArvoreForaDeOrdem() {
  // Pai depois do filho faria a propagação linear ler matriz não calculada —
  // matriz errada em silêncio. Tem que falhar alto.
  std::vector<NodeDesc> nos(2);
  nos[0].parent = 1;
  nos[1].parent = kNoParent;

  SceneMirror espelho;
  CHECK(!espelho.build(nos));
}

void testSceneMirrorCortaPeloFrustum() {
  std::vector<NodeDesc> nos(2);
  nos[0].parent = kNoParent;
  nos[0].radius = 1.0f;
  nos[1].parent = kNoParent;
  nos[1].radius = 1.0f;
  nos[1].transform.py = -100.0f;

  SceneMirror espelho;
  CHECK(espelho.build(nos));

  // Plano único: y >= 0 (normal para cima, distância 0). O segundo nó está bem
  // abaixo e deve sair.
  std::vector<float> planos(scene::kFrustumPlanes * 4, 0.0f);
  for (int i = 0; i < scene::kFrustumPlanes; i++) planos[static_cast<size_t>(i) * 4 + 1] = 1.0f;

  const int visiveis = espelho.updateAndCull(identidade, planos.data());
  CHECK(visiveis == 1);
  CHECK(espelho.visible().size() == 1);
  CHECK(espelho.visible()[0] == 0);
}

void testSceneMirrorIgnoraIndiceForaDaCena() {
  // O JS pode estar um frame à frente numa remoção; isso não pode escrever
  // fora do vetor.
  std::vector<NodeDesc> nos(1);
  nos[0].parent = kNoParent;

  SceneMirror espelho;
  CHECK(espelho.build(nos));

  const double fora[kSyncFloatsPerNode] = {99, 5, 5, 5, 0, 0, 0, 1, 1, 1, 1};
  espelho.applyTransforms(fora, kSyncFloatsPerNode);
  const auto planos = planosAmplos();
  espelho.updateAndCull(identidade, planos.data());

  CHECK(espelho.size() == 1);
}

void testSceneMirrorNaoRecalculaQuemNaoMudou() {
  // Depois de um frame sem mudança nenhuma, a matriz de mundo continua válida —
  // é o que permite pular o trabalho de 95% dos nós.
  std::vector<NodeDesc> nos(2);
  nos[0].parent = kNoParent;
  nos[1].parent = 0;
  nos[1].transform.px = 3.0f;

  SceneMirror espelho;
  CHECK(espelho.build(nos));
  const auto planos = planosAmplos();
  espelho.updateAndCull(identidade, planos.data());
  espelho.updateAndCull(identidade, planos.data());

  CHECK(std::fabs(espelho.worldMatrix(1)[12] - 3.0) < 1e-9);
}

}  // namespace tests
