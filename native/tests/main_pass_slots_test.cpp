// Testes das camadas e da esfera do OBJETO no culling do passe principal
// (SPEC-0686).
//
// O culler tem de devolver o que o `_projectObject` do `three` empurraria:
// `Layers.test` contra a câmera (sem podar os filhos) e, para quem tem esfera
// própria, `Frustum.intersectsObject` com ela e o `z` do centro da geometria.
#include "../src/scene/main_pass_culler.h"

#include <cmath>
#include <vector>

#include "harness.h"

namespace {

using scene::Bounds;
using scene::kNoParent;
using scene::MainPassCuller;
using scene::NodeDesc;
using scene::ObjectSphere;
using scene::SceneMirror;

float identidade[16] = {1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1};
const double kViewProjIdentidade[16] = {1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1};
constexpr double kTolerancia = 1e-9;
/** Camada 2 (`layers.set(2)`) e as duas primeiras. */
constexpr uint32_t kCamada2 = 1u << 2;
constexpr uint32_t kCamadas01 = 0x3;
/** `layers.set(31)` do `three`: `2^31` (sem sinal). */
constexpr uint32_t kCamada31 = 1u << 31;

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

NodeDesc no(scene::NodeIndex pai, double x, uint16_t flags, double raio = 1) {
  NodeDesc d;
  d.parent = pai;
  d.transform.px = x;
  d.flags = flags;
  d.bounds = Bounds{0, 0, 0, raio};
  return d;
}

NodeDesc malha(scene::NodeIndex pai, double x) {
  return no(pai, x, scene::kNodeMainCull | scene::kNodeMainFrustumCulled);
}

NodeDesc instanciada(scene::NodeIndex pai, double x) {
  return no(pai, x, scene::kNodeMainJsCull | scene::kNodeMainFrustumCulled);
}

int projetar(MainPassCuller& culler, SceneMirror& espelho, double lado, uint32_t camadas = scene::kAllLayers,
             const double* viewProj = kViewProjIdentidade) {
  const std::vector<float> amplos(scene::kFrustumPlanes * 4, 0.0f);
  espelho.updateAndCull(identidade, amplos.data());
  const auto planos = caixa(lado);
  return culler.cull(espelho, planos.data(), viewProj, camadas);
}

ObjectSphere esfera(double cx, double raio, double profundidadeZ = 0) {
  ObjectSphere s;
  s.cull = Bounds{cx, 0, 0, raio};
  s.depthZ = profundidadeZ;
  return s;
}

}  // namespace

namespace tests {

void testMainSlotsCamadasPadraoEEscrita() {
  scene::MainPassSlots slots;
  CHECK(slots.layers(0) == scene::kDefaultLayers);
  CHECK(slots.layers(500) == scene::kDefaultLayers);
  slots.setLayers(7, kCamada2);
  CHECK(slots.layers(7) == kCamada2);
  CHECK(slots.layers(6) == scene::kDefaultLayers);
  slots.reset();
  CHECK(slots.layers(7) == scene::kDefaultLayers);
}

void testMainSlotsCamadaForaNaoEntraMasOFilhoSim() {
  std::vector<NodeDesc> nos;
  nos.push_back(no(kNoParent, 0, 0));  // 0: raiz
  nos.push_back(malha(0, 0));          // 1: camada 2
  nos.push_back(malha(1, 0));          // 2: filho, camada padrão
  NodeDesc luz = no(0, 0, scene::kNodeLight);
  nos.push_back(luz);                  // 3: luz na camada 2
  SceneMirror espelho;
  MainPassCuller culler;
  CHECK(espelho.build(nos));
  culler.slots().setLayers(1, kCamada2);
  culler.slots().setLayers(3, kCamada2);
  // Câmera na camada 0: o pai e a luz saem; o filho (camada 0) continua.
  CHECK(projetar(culler, espelho, 100, scene::kDefaultLayers) == 1);
  CHECK(culler.candidates()[0].index == 2);
  // Câmera nas camadas 0 e 1: igual. Câmera com tudo: entram os três.
  CHECK(projetar(culler, espelho, 100, kCamadas01) == 1);
  CHECK(projetar(culler, espelho, 100, scene::kAllLayers) == 3);
}

void testMainSlotsMascaraZeroECanal31() {
  std::vector<NodeDesc> nos;
  nos.push_back(no(kNoParent, 0, 0));
  nos.push_back(malha(0, 0));  // 1: `layers.disableAll()`
  nos.push_back(malha(0, 0));  // 2: `layers.set(31)`
  SceneMirror espelho;
  MainPassCuller culler;
  CHECK(espelho.build(nos));
  culler.slots().setLayers(1, 0);
  culler.slots().setLayers(2, kCamada31);
  // Máscara 0 nunca passa no `test` do `three`, nem com a câmera `enableAll`.
  CHECK(projetar(culler, espelho, 100, scene::kAllLayers) == 1);
  CHECK(culler.candidates()[0].index == 2);
  CHECK(projetar(culler, espelho, 100, kCamada31) == 1);
  CHECK(projetar(culler, espelho, 100, scene::kDefaultLayers) == 0);
}

void testMainSlotsEsferaDoObjetoCorta() {
  // Instâncias na origem do nó em x=50, mas o aglomerado delas (a esfera do
  // OBJETO) está em x=-45 local: no mundo, x=5, dentro da caixa de meia-aresta 10.
  std::vector<NodeDesc> nos;
  nos.push_back(no(kNoParent, 0, 0));
  nos.push_back(instanciada(0, 50));  // 1: dentro pela esfera do objeto
  nos.push_back(instanciada(0, 50));  // 2: esfera do objeto fora
  nos.push_back(instanciada(0, 50));  // 3: sem esfera: o JS corta (pass-through)
  SceneMirror espelho;
  MainPassCuller culler;
  CHECK(espelho.build(nos));
  culler.slots().setObjectSphere(1, esfera(-45, 1));
  culler.slots().setObjectSphere(2, esfera(0, 1));
  CHECK(projetar(culler, espelho, 10) == 2);
  CHECK(culler.candidates()[0].index == 1);
  CHECK(culler.candidates()[1].index == 3);
  CHECK(culler.candidates()[1].z == 0);
}

void testMainSlotsZDoCentroDaGeometria() {
  // O corte é pela esfera do objeto; o `z`, pelo centro da GEOMETRIA (0,0,2)
  // levado ao mundo (nó em x=1): z=2, z' = 2*2 + 3 = 7.
  std::vector<NodeDesc> nos;
  nos.push_back(no(kNoParent, 0, 0));
  nos.push_back(instanciada(0, 1));
  const double vp[16] = {1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 2, 1, 0, 0, 3, 0};
  SceneMirror espelho;
  MainPassCuller culler;
  CHECK(espelho.build(nos));
  culler.slots().setObjectSphere(1, esfera(4, 1, 2));
  CHECK(projetar(culler, espelho, 100, scene::kAllLayers, vp) == 1);
  CHECK(std::fabs(culler.candidates()[0].z - 7.0) < kTolerancia);
}

void testMainSlotsEsferaComMaiorEscala() {
  // Raio 1 em x=12 com escala 3 em y: raio de mundo 3 alcança x=9 (caixa de 10).
  std::vector<NodeDesc> nos;
  nos.push_back(no(kNoParent, 0, 0));
  NodeDesc escalada = instanciada(0, 0);
  escalada.transform.sy = 3;
  nos.push_back(escalada);
  SceneMirror espelho;
  MainPassCuller culler;
  CHECK(espelho.build(nos));
  culler.slots().setObjectSphere(1, esfera(12, 1));
  CHECK(projetar(culler, espelho, 10) == 1);
}

void testMainSlotsSemFrustumCulledNaoCorta() {
  std::vector<NodeDesc> nos;
  nos.push_back(no(kNoParent, 0, 0));
  nos.push_back(no(0, 500, scene::kNodeMainJsCull));  // frustumCulled = false
  SceneMirror espelho;
  MainPassCuller culler;
  CHECK(espelho.build(nos));
  culler.slots().setObjectSphere(1, esfera(0, 1, 0));
  CHECK(projetar(culler, espelho, 10) == 1);
}

void testMainSlotsClearEResetVoltamAoPassThrough() {
  std::vector<NodeDesc> nos;
  nos.push_back(no(kNoParent, 0, 0));
  nos.push_back(instanciada(0, 500));
  SceneMirror espelho;
  MainPassCuller culler;
  CHECK(espelho.build(nos));
  culler.slots().setObjectSphere(1, esfera(0, 1));
  CHECK(projetar(culler, espelho, 10) == 0);
  culler.slots().clearObjectSphere(1);
  CHECK(projetar(culler, espelho, 10) == 1);
  culler.slots().setObjectSphere(1, esfera(0, 1));
  culler.slots().reset();
  CHECK(projetar(culler, espelho, 10) == 1);
  // Esfera num nó que NÃO é JsCull (malha comum) é ignorada: vale a da geometria.
  std::vector<NodeDesc> comuns;
  comuns.push_back(no(kNoParent, 0, 0));
  comuns.push_back(malha(0, 0));
  SceneMirror outro;
  CHECK(outro.build(comuns));
  culler.slots().setObjectSphere(1, esfera(500, 1));
  CHECK(projetar(culler, outro, 10) == 1);
}

}  // namespace tests
