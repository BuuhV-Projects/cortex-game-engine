// Testes da exclusao de casters skinados no gate do passe de sombra
// (SPEC-0690, item 4; ADR-0691).
//
// O skinado deixou de recusar a cascata: o player esta sempre na cascata 0, e
// recusar por ele tiraria a CSM nativa inteira. Ele sai da lista do desenho e
// conta em `excludedCasters`. O que estes testes guardam e que a exclusao nao
// vire um buraco: os OUTROS casters continuam julgados como antes.
#include "../src/scene/shadow_pass_gate.h"

#include <vector>

#include "../src/scene/shadow_caster_enumerator.h"
#include "harness.h"

namespace {

using scene::Bounds;
using scene::kNoParent;
using scene::NodeDesc;
using scene::NodeIndex;
using scene::SceneMirror;
using scene::ShadowCasterEnumerator;
using scene::ShadowCasterParams;
using scene::ShadowGateFrame;
using scene::ShadowGateRefusal;
using scene::ShadowGateResult;

float identidade[16] = {1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1};

/** Distancia dos planos amplos: nada fica fora do frustum. */
constexpr float kPlanoAmplo = 1.0e6f;
/** Id da unica geometria que o registro falso conhece. */
constexpr int32_t kGeometriaRegistrada = 7;

bool presencaFalsa(int32_t geometryId, void*) { return geometryId == kGeometriaRegistrada; }

std::vector<float> planosAmplos() {
  std::vector<float> planos(scene::kFrustumPlanes * 4, 0.0f);
  for (int i = 0; i < scene::kFrustumPlanes; i++) {
    planos[static_cast<size_t>(i) * 4 + 1] = 1.0f;
    planos[static_cast<size_t>(i) * 4 + 3] = kPlanoAmplo;
  }
  return planos;
}

NodeDesc casterAceito() {
  NodeDesc no;
  no.parent = kNoParent;
  no.flags = scene::kNodeDrawable | scene::kNodeCastShadow;
  no.geometryId = kGeometriaRegistrada;
  no.bounds = Bounds{0, 0, 0, 1};
  return no;
}

NodeDesc com(NodeDesc no, uint16_t bits) {
  no.flags = static_cast<uint16_t>(no.flags | bits);
  return no;
}

/** Roda o gate com a lista do desenho pedida (sem consultas de instancia/recorte). */
ShadowGateResult avaliar(const std::vector<NodeDesc>& nos, std::vector<NodeIndex>& lista) {
  SceneMirror espelho;
  CHECK(espelho.build(nos));
  const auto planos = planosAmplos();
  espelho.updateAndCull(identidade, planos.data());
  ShadowCasterEnumerator enumerador;
  enumerador.enumerate(espelho, ShadowCasterParams{}, planos.data());
  ShadowGateFrame frame;
  frame.sceneNodeCount = static_cast<int32_t>(nos.size());
  // Lixo de antes: a lista tem de sair limpa, nunca acumular entre cascatas.
  lista.assign(3, 99);
  return scene::evaluateShadowPassGate(espelho, enumerador.casters(), frame, presencaFalsa,
                                       nullptr, nullptr, nullptr, &lista);
}

}  // namespace

namespace tests {

void testShadowGateExcluiSkinnedSemRecusar() {
  const std::vector<NodeDesc> nos = {casterAceito(), com(casterAceito(), scene::kNodeSkinned)};
  std::vector<NodeIndex> lista;
  const ShadowGateResult r = avaliar(nos, lista);
  CHECK(r.accepted);
  CHECK(r.reason == ShadowGateRefusal::kNone);
  CHECK(r.excludedCasters == 1);
  CHECK(r.totalCasters == 2);
  CHECK(r.refusedCasters == 0);
  CHECK(r.counts[static_cast<size_t>(ShadowGateRefusal::kSkinnedCaster)] == 0);
  CHECK(lista.size() == 1);
  CHECK(!lista.empty() && lista[0] == 0);  // so o caster comum segue para o desenho
}

void testShadowGateExcluidoNaoEJulgado() {
  // Skinado sem geometria registrada e com recorte que o host nao tem: como
  // ele nao e desenhado, nenhum desses motivos pode recusar a cascata.
  NodeDesc skinado = com(casterAceito(), scene::kNodeSkinned | scene::kNodeAlphaClip);
  skinado.geometryId = kGeometriaRegistrada + 1;
  const std::vector<NodeDesc> nos = {skinado};
  std::vector<NodeIndex> lista;
  const ShadowGateResult r = avaliar(nos, lista);
  CHECK(r.accepted);
  CHECK(r.excludedCasters == 1);
  CHECK(r.counts[static_cast<size_t>(ShadowGateRefusal::kGeometryMissing)] == 0);
  CHECK(r.counts[static_cast<size_t>(ShadowGateRefusal::kAlphaClip)] == 0);
  CHECK(lista.empty());
}

void testShadowGateExcluidoNaoEscondeRecusaDosOutros() {
  // O skinado sai, mas o caster com recorte sem textura no host segue recusando,
  // e o ofensor apontado e ele (indice 1), nunca o excluido.
  const std::vector<NodeDesc> nos = {com(casterAceito(), scene::kNodeSkinned),
                                     com(casterAceito(), scene::kNodeAlphaClip)};
  std::vector<NodeIndex> lista;
  const ShadowGateResult r = avaliar(nos, lista);
  CHECK(!r.accepted);
  CHECK(r.reason == ShadowGateRefusal::kAlphaClip);
  CHECK(r.firstOffender == 1);
  CHECK(r.excludedCasters == 1);
  CHECK(r.refusedCasters == 1);
}

}  // namespace tests
