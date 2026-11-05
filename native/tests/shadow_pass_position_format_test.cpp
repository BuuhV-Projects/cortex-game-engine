// Testes do motivo `posicao-nao-float32x3` do gate do passe de sombra (ADR-0692).
//
// A geometria cuja `position` nao e `float32x3` nao tem caminho no pipeline do
// passe. Ela recusa a cascata, mas com motivo proprio: `geometria-ausente` quer
// dizer "ainda nao subiu" e some sozinho; este nao some, e confundir os dois
// manda quem depura esperar uma fila que nunca esvazia.
#include <cstring>
#include <vector>

#include "../src/scene/shadow_caster_enumerator.h"
#include "../src/scene/shadow_pass_gate.h"
#include "harness.h"

namespace {

using scene::Bounds;
using scene::kNoParent;
using scene::NodeDesc;
using scene::SceneMirror;
using scene::ShadowCasterEnumerator;
using scene::ShadowCasterParams;
using scene::ShadowGateFrame;
using scene::ShadowGateRefusal;
using scene::ShadowGateResult;

float identidade[16] = {1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1};

/** Distancia dos planos amplos: nada fica fora do frustum. */
constexpr float kPlanoAmplo = 1.0e6f;
/** Geometria registrada, recusada por formato e nunca vista. */
constexpr int32_t kGeometriaRegistrada = 7;
constexpr int32_t kGeometriaTorta = 8;
constexpr int32_t kGeometriaNova = 9;

bool presencaFalsa(int32_t geometryId, void*) { return geometryId == kGeometriaRegistrada; }
bool formatoRecusadoFalso(int32_t geometryId, void*) { return geometryId == kGeometriaTorta; }

std::vector<float> planosAmplos() {
  std::vector<float> planos(scene::kFrustumPlanes * 4, 0.0f);
  for (int i = 0; i < scene::kFrustumPlanes; i++) {
    planos[static_cast<size_t>(i) * 4 + 1] = 1.0f;
    planos[static_cast<size_t>(i) * 4 + 3] = kPlanoAmplo;
  }
  return planos;
}

NodeDesc caster(int32_t geometria) {
  NodeDesc no;
  no.parent = kNoParent;
  no.flags = scene::kNodeDrawable | scene::kNodeCastShadow;
  no.geometryId = geometria;
  no.bounds = Bounds{0, 0, 0, 1};
  return no;
}

ShadowGateResult avaliar(const std::vector<NodeDesc>& nos, scene::PositionFormatRefused formato) {
  SceneMirror espelho;
  CHECK(espelho.build(nos));
  const auto planos = planosAmplos();
  espelho.updateAndCull(identidade, planos.data());
  ShadowCasterEnumerator enumerador;
  enumerador.enumerate(espelho, ShadowCasterParams{}, planos.data());
  ShadowGateFrame frame;
  frame.sceneNodeCount = static_cast<int32_t>(nos.size());
  return scene::evaluateShadowPassGate(espelho, enumerador.casters(), frame, presencaFalsa,
                                       nullptr, nullptr, nullptr, nullptr, formato);
}

size_t indice(ShadowGateRefusal motivo) { return static_cast<size_t>(motivo); }

}  // namespace

namespace tests {

void testShadowGateRecusaPosicaoForaDeFloat32x3() {
  const std::vector<NodeDesc> nos = {caster(kGeometriaRegistrada), caster(kGeometriaTorta),
                                     caster(kGeometriaNova)};
  const ShadowGateResult r = avaliar(nos, formatoRecusadoFalso);
  CHECK(!r.accepted);
  // Cada caster no SEU motivo: o torto nao vira ausente, o novo nao vira torto.
  CHECK(r.counts[indice(ShadowGateRefusal::kPositionNotFloat32x3)] == 1);
  CHECK(r.counts[indice(ShadowGateRefusal::kGeometryMissing)] == 1);
  CHECK(r.refusedCasters == 2);
  // Ausente vem antes na prioridade do relato; o primeiro ofensor e o do motivo.
  CHECK(r.reason == ShadowGateRefusal::kGeometryMissing);
  CHECK(r.firstOffender == 2);

  // So o torto: o motivo e o novo, e o ofensor e ele.
  const ShadowGateResult so = avaliar({caster(kGeometriaRegistrada), caster(kGeometriaTorta)},
                                      formatoRecusadoFalso);
  CHECK(so.reason == ShadowGateRefusal::kPositionNotFloat32x3);
  CHECK(so.offenders == 1);
  CHECK(so.firstOffender == 1);
}

void testShadowGatePosicaoSemConsultaContaComoAusente() {
  // Sem a consulta de formato, o comportamento anterior: tudo e ausente.
  const ShadowGateResult r =
      avaliar({caster(kGeometriaRegistrada), caster(kGeometriaTorta)}, nullptr);
  CHECK(r.reason == ShadowGateRefusal::kGeometryMissing);
  CHECK(r.counts[indice(ShadowGateRefusal::kPositionNotFloat32x3)] == 0);
  // O motivo novo fica no FIM do enum (o JS indexa pela posicao) e tem nome.
  CHECK(indice(ShadowGateRefusal::kPositionNotFloat32x3) ==
        static_cast<size_t>(scene::kShadowGateRefusalCount - 1));
  CHECK(std::strcmp(scene::shadowGateRefusalName(ShadowGateRefusal::kPositionNotFloat32x3),
                    "posicao-nao-float32x3") == 0);
}

}  // namespace tests
