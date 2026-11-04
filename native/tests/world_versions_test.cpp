// Testes da versão da matriz de mundo por candidato (SPEC-0682, ADR-0683).
//
// A versão só pode PULAR uma comparação que daria "igual": mesma versão tem de
// ser mesma matriz, qualquer que seja quem escreveu o mundo (sync do host ou o
// JS direto na fatia), e a ordem/`z` dos candidatos não muda.
#include <vector>

#include "../src/scene/main_pass_culler.h"
#include "harness.h"

namespace {

using scene::Bounds;
using scene::kNoParent;
using scene::MainPassCuller;
using scene::NodeDesc;
using scene::SceneMirror;

float identidade[16] = {1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1};
const double kViewProj[16] = {1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1};

/** Frustum enorme: tudo entra. */
std::vector<double> planosAmplos() {
  std::vector<double> p(scene::kFrustumPlanes * 4, 0.0);
  const double normais[6][3] = {{1, 0, 0}, {-1, 0, 0}, {0, 1, 0}, {0, -1, 0}, {0, 0, 1}, {0, 0, -1}};
  for (int i = 0; i < scene::kFrustumPlanes; i++) {
    for (int k = 0; k < 3; k++) p[static_cast<size_t>(i) * 4 + k] = normais[i][k];
    p[static_cast<size_t>(i) * 4 + 3] = 1e6;
  }
  return p;
}

NodeDesc malha(scene::NodeIndex pai, double x) {
  NodeDesc no;
  no.parent = pai;
  no.transform.px = x;
  no.flags = scene::kNodeMainCull | scene::kNodeMainFrustumCulled;
  no.bounds = Bounds{0, 0, 0, 1};
  return no;
}

NodeDesc grupo(scene::NodeIndex pai) {
  NodeDesc no;
  no.parent = pai;
  return no;
}

/** Linha de sync de um nó visível em `x`. */
std::vector<double> linha(double indice, double x) {
  std::vector<double> sync(scene::kSyncFloatsPerNode, 0.0);
  sync[0] = indice;
  sync[1] = x;
  sync[7] = 1;
  sync[8] = sync[9] = sync[10] = 1;
  sync[scene::kSyncFlags] = scene::kSyncVisible | scene::kSyncMaterialVisible | scene::kSyncFrustumCulled;
  return sync;
}

/** Atualiza o espelho e projeta; devolve a versão do candidato do nó `indice` (0 se não veio). */
uint64_t versaoDe(MainPassCuller& culler, SceneMirror& espelho, scene::NodeIndex indice) {
  const std::vector<float> amplos(scene::kFrustumPlanes * 4, 0.0f);
  espelho.updateAndCull(identidade, amplos.data());
  const auto planos = planosAmplos();
  if (culler.cull(espelho, planos.data(), kViewProj) < 0) return 0;
  for (const auto& c : culler.candidates()) if (c.index == indice) return c.worldVersion;
  return 0;
}

/** Raiz (0), pai (1) em x=0 e duas malhas filhas (2, 3) em x=1 e x=5. */
void montar(SceneMirror& espelho) {
  std::vector<NodeDesc> nos;
  nos.push_back(grupo(kNoParent));
  nos.push_back(grupo(0));
  nos.push_back(malha(1, 1));
  nos.push_back(malha(1, 5));
  CHECK(espelho.build(nos));
}

}  // namespace

namespace tests {

void testWorldVersionParadoMantemAVersao() {
  SceneMirror espelho;
  MainPassCuller culler;
  montar(espelho);
  const uint64_t primeira = versaoDe(culler, espelho, 2);
  CHECK(primeira != 0);
  CHECK(versaoDe(culler, espelho, 2) == primeira);
  CHECK(versaoDe(culler, espelho, 2) == primeira);
}

void testWorldVersionMovidoPeloSyncGanhaVersaoNova() {
  SceneMirror espelho;
  MainPassCuller culler;
  montar(espelho);
  const uint64_t antes = versaoDe(culler, espelho, 2);
  const auto sync = linha(2, 2);
  espelho.applyTransforms(sync.data(), sync.size());
  const uint64_t depois = versaoDe(culler, espelho, 2);
  CHECK(depois != 0 && depois != antes);
  // A irmã não se mexeu: a versão dela fica.
  const uint64_t irma = versaoDe(culler, espelho, 3);
  CHECK(versaoDe(culler, espelho, 3) == irma);
}

void testWorldVersionPaiMovidoMudaOFilho() {
  SceneMirror espelho;
  MainPassCuller culler;
  montar(espelho);
  const uint64_t filho = versaoDe(culler, espelho, 2);
  const auto sync = linha(1, 10);
  espelho.applyTransforms(sync.data(), sync.size());
  CHECK(versaoDe(culler, espelho, 2) != filho);
}

void testWorldVersionEscritaDiretaDoJsGanhaVersaoNova() {
  // O `updateWorldMatrix` sob pedido (SPEC-0340) escreve na fatia sem linha de
  // sync: é o caso que uma versão por rastreio de escrita perderia (ADR-0683).
  SceneMirror espelho;
  MainPassCuller culler;
  montar(espelho);
  const uint64_t antes = versaoDe(culler, espelho, 3);
  const auto planos = planosAmplos();
  espelho.worldData()[3 * scene::kMatrixFloats + 12] = 7;  // translação x, sem passar pelo host
  CHECK(culler.cull(espelho, planos.data(), kViewProj) == 2);
  uint64_t depois = 0;
  for (const auto& c : culler.candidates()) if (c.index == 3) depois = c.worldVersion;
  CHECK(depois != 0 && depois != antes);
}

void testWorldVersionVoltarAoValorNaoReusaVersaoAntiga() {
  // Ida e volta: a versão antiga não volta (o JS só confere de novo, por inteiro).
  SceneMirror espelho;
  MainPassCuller culler;
  montar(espelho);
  const uint64_t original = versaoDe(culler, espelho, 2);
  const auto ida = linha(2, 3);
  espelho.applyTransforms(ida.data(), ida.size());
  const uint64_t movida = versaoDe(culler, espelho, 2);
  const auto volta = linha(2, 1);
  espelho.applyTransforms(volta.data(), volta.size());
  const uint64_t voltou = versaoDe(culler, espelho, 2);
  CHECK(movida != original);
  CHECK(voltou != original && voltou != movida);
}

void testWorldVersionUnicaEntreSlots() {
  // Duas malhas com a MESMA matriz em slots diferentes: versões diferentes
  // (contador global), então um objeto que troca de slot nunca acha a sua.
  std::vector<NodeDesc> nos;
  nos.push_back(grupo(kNoParent));
  nos.push_back(malha(0, 4));
  nos.push_back(malha(0, 4));
  SceneMirror espelho;
  MainPassCuller culler;
  CHECK(espelho.build(nos));
  const uint64_t a = versaoDe(culler, espelho, 1);
  const uint64_t b = versaoDe(culler, espelho, 2);
  CHECK(a != 0 && b != 0 && a != b);
}

void testWorldVersionRecusaNaoTocaNasFotos() {
  std::vector<NodeDesc> nos;
  nos.push_back(grupo(kNoParent));
  NodeDesc lod = grupo(0);
  lod.flags = scene::kNodeMainUnsupported;
  nos.push_back(malha(0, 1));
  nos.push_back(lod);
  SceneMirror espelho;
  MainPassCuller culler;
  CHECK(espelho.build(nos));
  CHECK(versaoDe(culler, espelho, 1) == 0);  // recusado: sem candidatos, sem versão
  CHECK(culler.refusedAt() == 2);
}

void testWorldVersionNaoMudaOrdemNemZ() {
  // Paridade da ordem (SPEC-0682): candidatos na ordem do espelho, `z` do centro.
  SceneMirror espelho;
  MainPassCuller culler;
  montar(espelho);
  versaoDe(culler, espelho, 2);
  const auto& c = culler.candidates();
  CHECK(c.size() == 2);
  CHECK(c[0].index == 2 && c[1].index == 3);
  CHECK(c[0].z == 0 && c[1].z == 0);
  CHECK(c[0].worldVersion != c[1].worldVersion);
}

}  // namespace tests
