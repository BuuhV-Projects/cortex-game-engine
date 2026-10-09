// Testes da projeção do passe principal em C++ (SPEC-0332).
//
// O culler tem de devolver o que o `_projectObject` do `three` empurraria:
// visibilidade herdada, culling pela esfera da geometria (escalada pela maior
// escala), `z` de ordenação sem divisão por w, pass-through de luz e de quem o
// JS corta, e RECUSA quando alcança um nó que não reproduz.
#include "../src/scene/main_pass_culler.h"

#include <cmath>
#include <vector>

#include "harness.h"

namespace {

using scene::Bounds;
using scene::kNoParent;
using scene::MainPassCuller;
using scene::NodeDesc;
using scene::SceneMirror;

float identidade[16] = {1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1};
const double kViewProjIdentidade[16] = {1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1};
constexpr double kTolerancia = 1e-9;

/** Caixa alinhada aos eixos, de meia-aresta `lado`, centrada na origem. */
std::vector<double> caixa(double lado) {
  std::vector<double> p(scene::kFrustumPlanes * 4, 0.0);
  const double normais[6][3] = {{1, 0, 0}, {-1, 0, 0}, {0, 1, 0}, {0, -1, 0}, {0, 0, 1}, {0, 0, -1}};
  for (int i = 0; i < scene::kFrustumPlanes; i++) {
    const size_t base = static_cast<size_t>(i) * 4;
    p[base] = normais[i][0];
    p[base + 1] = normais[i][1];
    p[base + 2] = normais[i][2];
    p[base + 3] = lado;
  }
  return p;
}

NodeDesc malha(scene::NodeIndex pai, double x, double y, double z, double raio) {
  NodeDesc no;
  no.parent = pai;
  no.transform.px = x;
  no.transform.py = y;
  no.transform.pz = z;
  no.flags = scene::kNodeMainCull | scene::kNodeMainFrustumCulled;
  no.bounds = Bounds{0, 0, 0, raio};
  return no;
}

NodeDesc grupo(scene::NodeIndex pai) {
  NodeDesc no;
  no.parent = pai;
  return no;
}

/** Linha de sincronização de um nó parado, com as flags do frame pedidas. */
std::vector<double> linha(double indice, double x, double flags) {
  std::vector<double> sync(scene::kSyncFloatsPerNode, 0.0);
  sync[0] = indice;
  sync[1] = x;
  sync[7] = 1;                        // qw
  sync[8] = sync[9] = sync[10] = 1;   // escala
  sync[scene::kSyncFlags] = flags;
  return sync;
}

void atualizar(SceneMirror& espelho) {
  const std::vector<float> amplos(scene::kFrustumPlanes * 4, 0.0f);
  espelho.updateAndCull(identidade, amplos.data());
}

int projetar(MainPassCuller& culler, SceneMirror& espelho, double lado,
             const double* viewProj = kViewProjIdentidade) {
  atualizar(espelho);
  const auto planos = caixa(lado);
  return culler.cull(espelho, planos.data(), viewProj);
}

}  // namespace

namespace tests {

void testMainCullVisibilidadeHerdada() {
  std::vector<NodeDesc> nos;
  nos.push_back(grupo(kNoParent));  // 0: raiz
  NodeDesc paiEscondido = grupo(0);
  paiEscondido.visible = false;
  nos.push_back(paiEscondido);          // 1
  nos.push_back(malha(1, 0, 0, 0, 1));  // 2: visível, mas o pai não
  nos.push_back(malha(0, 0, 0, 0, 1));  // 3: entra
  SceneMirror espelho;
  MainPassCuller culler;
  CHECK(espelho.build(nos));
  CHECK(projetar(culler, espelho, 100) == 1);
  CHECK(culler.candidates()[0].index == 3);
}

void testMainCullFrustumComMaiorEscala() {
  // Esfera de raio 1 em x=12 com escala 3 em y: raio de mundo 3 alcança x=9,
  // dentro de uma caixa de meia-aresta 10. Com a escala MÉDIA (~1,67) ficaria
  // fora — é o erro que o `getMaxScaleOnAxis` existe para evitar.
  std::vector<NodeDesc> nos;
  nos.push_back(grupo(kNoParent));
  NodeDesc escalada = malha(0, 12, 0, 0, 1);
  escalada.transform.sy = 3;
  nos.push_back(escalada);              // 1: entra
  nos.push_back(malha(0, 50, 0, 0, 1)); // 2: fora
  NodeDesc semCulling = malha(0, 50, 0, 0, 1);
  semCulling.flags = scene::kNodeMainCull;  // frustumCulled = false
  nos.push_back(semCulling);            // 3: entra
  SceneMirror espelho;
  MainPassCuller culler;
  CHECK(espelho.build(nos));
  CHECK(projetar(culler, espelho, 10) == 2);
  CHECK(culler.candidates()[0].index == 1);
  CHECK(culler.candidates()[1].index == 3);
}

void testMainCullZDeOrdenacao() {
  // Centro local (0,0,2) num nó em z=5: o `z` é a linha z da viewProj aplicada
  // ao centro de MUNDO (z=7), sem dividir por w.
  std::vector<NodeDesc> nos;
  nos.push_back(grupo(kNoParent));
  NodeDesc m = malha(0, 0, 0, 5, 1);
  m.bounds = Bounds{0, 0, 2, 1};
  nos.push_back(m);
  const double vp[16] = {1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 2, 1, 0, 0, 3, 0};  // z' = 2z + 3
  SceneMirror espelho;
  MainPassCuller culler;
  CHECK(espelho.build(nos));
  CHECK(projetar(culler, espelho, 100, vp) == 1);
  CHECK(std::fabs(culler.candidates()[0].z - 17.0) < kTolerancia);
}

void testMainCullPassaLuzEJsCull() {
  // Luz e "o JS decide" entram mesmo fora do frustum; grupo sem flag não entra.
  std::vector<NodeDesc> nos;
  nos.push_back(grupo(kNoParent));
  NodeDesc luz = grupo(0);
  luz.flags = scene::kNodeLight;
  luz.transform.px = 500;
  nos.push_back(luz);
  NodeDesc instanciada = grupo(0);
  instanciada.flags = scene::kNodeMainJsCull;
  instanciada.transform.px = 500;
  nos.push_back(instanciada);
  SceneMirror espelho;
  MainPassCuller culler;
  CHECK(espelho.build(nos));
  CHECK(projetar(culler, espelho, 10) == 2);
}

void testMainCullRecusaNoNaoReproduzivelAlcancavel() {
  std::vector<NodeDesc> nos;
  nos.push_back(grupo(kNoParent));
  NodeDesc lodEscondido = grupo(0);
  lodEscondido.flags = scene::kNodeMainUnsupported;
  lodEscondido.visible = false;
  nos.push_back(lodEscondido);         // 1: inalcançável, não recusa
  nos.push_back(malha(0, 0, 0, 0, 1)); // 2
  SceneMirror espelho;
  MainPassCuller culler;
  CHECK(espelho.build(nos));
  CHECK(projetar(culler, espelho, 100) == 1);

  // Visível e marcado pela linha de sincronização (o `renderOrder` do grupo
  // mudou em runtime): o frame volta ao `three`.
  const auto sync = linha(1, 0, scene::kSyncVisible | scene::kSyncMainUnsupported);
  espelho.applyTransforms(sync.data(), sync.size());
  CHECK(projetar(culler, espelho, 100) == scene::kMainCullRefused);
  CHECK(culler.refusedAt() == 1);
}

void testMainCullFrustumCulledPorFrame() {
  // `frustumCulled` desligado em runtime chega pela linha de sincronização.
  std::vector<NodeDesc> nos;
  nos.push_back(grupo(kNoParent));
  nos.push_back(malha(0, 50, 0, 0, 1));
  SceneMirror espelho;
  MainPassCuller culler;
  CHECK(espelho.build(nos));
  CHECK(projetar(culler, espelho, 10) == 0);
  const auto sync = linha(1, 50, scene::kSyncVisible);  // sem kSyncFrustumCulled
  espelho.applyTransforms(sync.data(), sync.size());
  CHECK(projetar(culler, espelho, 10) == 1);
}

void testMainCullSetBoundsTrocaAEsfera() {
  std::vector<NodeDesc> nos;
  nos.push_back(grupo(kNoParent));
  nos.push_back(malha(0, 12, 0, 0, 1));
  SceneMirror espelho;
  MainPassCuller culler;
  CHECK(espelho.build(nos));
  CHECK(projetar(culler, espelho, 10) == 0);
  espelho.setBounds(1, Bounds{0, 0, 0, 5});  // a geometria cresceu
  CHECK(projetar(culler, espelho, 10) == 1);
}

}  // namespace tests
