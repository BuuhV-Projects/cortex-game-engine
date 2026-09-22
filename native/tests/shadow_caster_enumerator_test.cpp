// Testes do enumerador de casters de sombra (SPEC-0245, passo 1).
//
// O enumerador tem de reproduzir os filtros do `three` NA ORDEM dele. Cada
// teste aqui ataca um filtro isolado: visibilidade (que e herdada), autoria de
// `castShadow`, o limiar angular da SPEC-0197 nas bordas, e o frustum da ortho
// da cascata.
#include "../src/scene/shadow_caster_enumerator.h"

#include <vector>

#include "harness.h"

namespace {

using scene::Bounds;
using scene::kNoGeometry;
using scene::kNoParent;
using scene::NodeDesc;
using scene::SceneMirror;
using scene::ShadowCasterEnumerator;
using scene::ShadowCasterParams;

/** Matriz identidade para o `updateAndCull`, que nao usa a viewProj. */
float identidadeDaCena[16] = {1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1};

/** Planos amplos para o `updateAndCull`, que nao e o que este teste mede. */
std::vector<float> planosAmplos() {
  std::vector<float> planos(scene::kFrustumPlanes * 4, 0.0f);
  for (int i = 0; i < scene::kFrustumPlanes; i++) {
    planos[static_cast<size_t>(i) * 4 + 1] = 1.0f;
    planos[static_cast<size_t>(i) * 4 + 3] = 1.0e6f;
  }
  return planos;
}

/**
 * Frustum da "cascata": uma caixa alinhada aos eixos de meia-aresta `lado`,
 * centrada na origem. E o formato de uma ortho, que e o que o CSM usa.
 */
std::vector<float> caixaDeMeiaAresta(float lado) {
  std::vector<float> p(scene::kFrustumPlanes * 4, 0.0f);
  const float normais[6][3] = {{1, 0, 0}, {-1, 0, 0}, {0, 1, 0}, {0, -1, 0}, {0, 0, 1}, {0, 0, -1}};
  for (int i = 0; i < scene::kFrustumPlanes; i++) {
    const size_t base = static_cast<size_t>(i) * 4;
    p[base] = normais[i][0];
    p[base + 1] = normais[i][1];
    p[base + 2] = normais[i][2];
    p[base + 3] = lado;
  }
  return p;
}

/** Uma malha caster comum: desenhavel, com sombra autorada e sujeita ao frustum. */
NodeDesc malhaCaster(double x, double y, double z, double raio) {
  NodeDesc no;
  no.parent = kNoParent;
  no.transform.px = x;
  no.transform.py = y;
  no.transform.pz = z;
  no.flags = scene::kNodeDrawable | scene::kNodeCastShadow | scene::kNodeFrustumCulled;
  no.geometryId = 0;
  no.bounds = Bounds{0, 0, 0, raio};
  return no;
}

/** Monta o espelho e enumera, com a camera do jogo na origem. */
int enumerar(ShadowCasterEnumerator& enumerador, SceneMirror& espelho,
             const std::vector<NodeDesc>& nos, double minRatio, const std::vector<float>& frustum) {
  CHECK(espelho.build(nos));
  const auto amplos = planosAmplos();
  espelho.updateAndCull(identidadeDaCena, amplos.data());
  ShadowCasterParams params;
  params.minRatio = minRatio;
  return enumerador.enumerate(espelho, params, frustum.data());
}

}  // namespace

namespace tests {

void testShadowCasterIgnoraInvisivel() {
  // Duas formas de sumir: o proprio `visible = false` e o do PAI — o `three`
  // poda a subarvore inteira em `_projectObject`, entao o filho de um pai
  // invisivel nao desenha nem com `visible = true`.
  std::vector<NodeDesc> nos;
  nos.push_back(malhaCaster(0, 0, 0, 1));  // 0: entra

  NodeDesc escondido = malhaCaster(0, 0, 0, 1);
  escondido.visible = false;
  nos.push_back(escondido);  // 1: nao entra

  NodeDesc paiEscondido;
  paiEscondido.parent = kNoParent;
  paiEscondido.visible = false;
  nos.push_back(paiEscondido);  // 2: nem e malha

  NodeDesc filhoVisivel = malhaCaster(0, 0, 0, 1);
  filhoVisivel.parent = 2;
  nos.push_back(filhoVisivel);  // 3: visivel, mas o pai nao e

  SceneMirror espelho;
  ShadowCasterEnumerator enumerador;
  const int total = enumerar(enumerador, espelho, nos, 0.0, caixaDeMeiaAresta(100));
  CHECK(total == 1);
  CHECK(enumerador.casters().size() == 1);
  CHECK(enumerador.casters()[0] == 0);
}

void testShadowCasterExigeAutoriaEMalha() {
  // O que a SPEC-0197 chama de "autoria vence": sem `castShadow` autorado o no
  // nunca volta, e o que nao e malha desenhavel nunca entrou.
  std::vector<NodeDesc> nos;
  nos.push_back(malhaCaster(0, 0, 0, 1));  // 0: entra

  NodeDesc semSombra = malhaCaster(0, 0, 0, 1);
  semSombra.flags = scene::kNodeDrawable | scene::kNodeFrustumCulled;
  nos.push_back(semSombra);  // 1: autor desligou

  NodeDesc naoDesenhavel = malhaCaster(0, 0, 0, 1);
  naoDesenhavel.flags = scene::kNodeCastShadow | scene::kNodeFrustumCulled;
  naoDesenhavel.geometryId = kNoGeometry;
  nos.push_back(naoDesenhavel);  // 2: Group/luz/osso

  SceneMirror espelho;
  ShadowCasterEnumerator enumerador;
  const int total = enumerar(enumerador, espelho, nos, 0.0, caixaDeMeiaAresta(100));
  CHECK(total == 1);
  CHECK(enumerador.casters()[0] == 0);
}

void testShadowCasterLimiarAngularNasBordas() {
  // A regra pura, nas bordas: `>=` entra, um fio abaixo sai. Se isto virar `>`,
  // a contagem nativa fica UM objeto menor que a do `three` em cada empate.
  CHECK(scene::shouldCastShadow(1.0, 10.0, 0.1));    // exatamente no limiar
  CHECK(!scene::shouldCastShadow(0.999, 10.0, 0.1));
  CHECK(scene::shouldCastShadow(1.001, 10.0, 0.1));
  CHECK(scene::shouldCastShadow(0.0, 1000.0, 0.0));  // limiar 0 = filtro desligado
  // Distancia menor que 1 nao aumenta a razao: o piso evita divisao por ~0.
  CHECK(scene::shouldCastShadow(0.1, 0.001, 0.1));
  CHECK(!scene::shouldCastShadow(0.09, 0.001, 0.1));
}

void testShadowCasterAplicaLimiarNaCena() {
  // Camera na origem; raio 1 a 10 unidades da a razao 0,1 exata.
  std::vector<NodeDesc> nos;
  nos.push_back(malhaCaster(0, 0, 10, 1.0));   // 0: razao 0,10 — entra
  nos.push_back(malhaCaster(0, 0, 20, 1.0));   // 1: razao 0,05 — sai

  // Escala do NO conta: o `three` multiplica o raio pela maior escala do eixo.
  NodeDesc grande = malhaCaster(0, 0, 20, 1.0);
  grande.transform.sx = 3;
  nos.push_back(grande);  // 2: raio 3 a 20 = 0,15 — entra

  // Skinada/instanced ficam FORA do filtro angular (bounding sphere mente).
  NodeDesc isenta = malhaCaster(0, 0, 90, 0.01);
  isenta.flags |= scene::kNodeSkipAngularCull;
  nos.push_back(isenta);  // 3: minusculo e longe, mas isento — entra

  SceneMirror espelho;
  ShadowCasterEnumerator enumerador;
  const int total = enumerar(enumerador, espelho, nos, 0.1, caixaDeMeiaAresta(1000));
  CHECK(total == 3);
  CHECK(enumerador.casters()[0] == 0);
  CHECK(enumerador.casters()[1] == 2);
  CHECK(enumerador.casters()[2] == 3);
}

void testShadowCasterCortaPeloFrustumDaCascata() {
  // A caixa cobre ±50. Quem esta fora dela sai, mesmo passando no angular —
  // e quem esta so encostando entra, porque o teste tem a folga do raio.
  std::vector<NodeDesc> nos;
  nos.push_back(malhaCaster(0, 0, 0, 5));      // 0: dentro
  nos.push_back(malhaCaster(200, 0, 0, 5));    // 1: fora, longe
  nos.push_back(malhaCaster(53, 0, 0, 5));     // 2: centro fora, esfera encosta
  nos.push_back(malhaCaster(58, 0, 0, 5));     // 3: centro fora, esfera tambem

  // `frustumCulled = false`: nenhum frustum corta (ceu, helper).
  NodeDesc semCorte = malhaCaster(500, 0, 0, 5);
  semCorte.flags = scene::kNodeDrawable | scene::kNodeCastShadow;
  nos.push_back(semCorte);  // 4: fora, mas escapa do corte

  SceneMirror espelho;
  ShadowCasterEnumerator enumerador;
  const int total = enumerar(enumerador, espelho, nos, 0.0, caixaDeMeiaAresta(50));
  CHECK(total == 3);
  CHECK(enumerador.casters()[0] == 0);
  CHECK(enumerador.casters()[1] == 2);
  CHECK(enumerador.casters()[2] == 4);
}

void testShadowCasterUsaCentroDaEsferaNaoDaOrigem() {
  // O `three` corta pela esfera da GEOMETRIA, cujo centro raramente e a origem
  // do no — uma pista longa tem origem num canto. Usar a translacao do no no
  // lugar do centro tiraria da lista exatamente os objetos grandes.
  std::vector<NodeDesc> nos;
  NodeDesc deslocada = malhaCaster(0, 0, 0, 1);
  deslocada.bounds = scene::Bounds{200, 0, 0, 1};  // origem dentro, esfera fora
  nos.push_back(deslocada);

  SceneMirror espelho;
  ShadowCasterEnumerator enumerador;
  const int total = enumerar(enumerador, espelho, nos, 0.0, caixaDeMeiaAresta(50));
  CHECK(total == 0);
}

void testShadowCasterGuardaOVinculoComAGeometria() {
  // O passo 2 desenha a partir daqui: sem o id, o C++ tem a lista de quem
  // desenha e nenhum meio de saber o QUE desenhar.
  std::vector<NodeDesc> nos;
  NodeDesc comGeometria = malhaCaster(0, 0, 0, 2.5);
  comGeometria.geometryId = 77;
  comGeometria.bounds = scene::Bounds{1, 2, 3, 2.5};
  nos.push_back(comGeometria);

  NodeDesc semGeometria;
  semGeometria.parent = kNoParent;
  nos.push_back(semGeometria);

  SceneMirror espelho;
  CHECK(espelho.build(nos));
  CHECK(espelho.geometryId(0) == 77);
  CHECK(espelho.geometryId(1) == kNoGeometry);
  CHECK(espelho.bounds(0).cx == 1);
  CHECK(espelho.bounds(0).cz == 3);
  CHECK(espelho.bounds(0).radius == 2.5);
  CHECK(espelho.hasFlag(0, scene::kNodeCastShadow));
  CHECK(!espelho.hasFlag(1, scene::kNodeCastShadow));
}

void testShadowCasterSegueOVisibleDoFrame() {
  // O `visible` chega pelo buffer de sincronizacao, nao so pelo `build`: um no
  // escondido em runtime tem de sair da lista NO MESMO frame. Enquanto isso
  // nao existia, o C++ contava ate 42 casters a mais que o `three`.
  std::vector<NodeDesc> nos;
  nos.push_back(malhaCaster(0, 0, 0, 1));
  nos.push_back(malhaCaster(0, 0, 0, 1));

  SceneMirror espelho;
  ShadowCasterEnumerator enumerador;
  const auto frustum = caixaDeMeiaAresta(100);
  CHECK(espelho.build(nos));
  const auto amplos = planosAmplos();
  espelho.updateAndCull(identidadeDaCena, amplos.data());
  ShadowCasterParams params;
  CHECK(enumerador.enumerate(espelho, params, frustum.data()) == 2);

  // Esconde o segundo no; o primeiro segue visivel.
  const double sync[scene::kSyncFloatsPerNode * 2] = {
      0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1,
      1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0,
  };
  espelho.applyTransforms(sync, scene::kSyncFloatsPerNode * 2);
  espelho.updateAndCull(identidadeDaCena, amplos.data());
  CHECK(enumerador.enumerate(espelho, params, frustum.data()) == 1);
  CHECK(enumerador.casters()[0] == 0);
}

}  // namespace tests
