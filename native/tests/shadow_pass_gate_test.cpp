// Testes do gate de recusa do passe de sombra (SPEC-0245, E3 do passo 2).
//
// O gate so tem valor se recusar. Cada teste aqui monta UMA condicao e
// verifica duas coisas: que o veredito e recusa, e que o motivo relatado e o
// certo — um gate que recusa pelo motivo errado manda quem for depurar para o
// lugar errado, que e quase tao ruim quanto nao recusar.
#include "../src/scene/shadow_pass_gate.h"

#include <cstring>
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

/** Planos que nao cortam nada: o gate nao mede frustum, o enumerador ja mediu. */
std::vector<float> planosAmplos() {
  std::vector<float> planos(scene::kFrustumPlanes * 4, 0.0f);
  for (int i = 0; i < scene::kFrustumPlanes; i++) {
    planos[static_cast<size_t>(i) * 4 + 1] = 1.0f;
    planos[static_cast<size_t>(i) * 4 + 3] = 1.0e6f;
  }
  return planos;
}

/** Id da unica geometria que o registro falso conhece. */
constexpr int32_t kGeometriaRegistrada = 7;

/** Registro falso: so `kGeometriaRegistrada` existe. */
bool presencaFalsa(int32_t geometryId, void*) { return geometryId == kGeometriaRegistrada; }

/** Caster que o gate ACEITA: desenhavel, com sombra autorada e geometria registrada. */
NodeDesc casterAceito() {
  NodeDesc no;
  no.parent = kNoParent;
  no.flags = scene::kNodeDrawable | scene::kNodeCastShadow;
  no.geometryId = kGeometriaRegistrada;
  no.bounds = Bounds{0, 0, 0, 1};
  return no;
}

/** Monta o espelho, enumera os casters e roda o gate. */
ShadowGateResult avaliar(const std::vector<NodeDesc>& nos, const ShadowGateFrame& frame) {
  SceneMirror espelho;
  CHECK(espelho.build(nos));
  const auto planos = planosAmplos();
  espelho.updateAndCull(identidade, planos.data());
  ShadowCasterEnumerator enumerador;
  ShadowCasterParams params;  // minRatio 0 = sem filtro angular
  enumerador.enumerate(espelho, params, planos.data());
  return scene::evaluateShadowPassGate(espelho, enumerador.casters(), frame, presencaFalsa,
                                       nullptr);
}

/** Frame sem nenhum fato global contra: tantos nos quanto o espelho, sem VSM. */
ShadowGateFrame frameLimpo(size_t nos) {
  ShadowGateFrame f;
  f.sceneNodeCount = static_cast<int32_t>(nos);
  return f;
}

/** Recusa por um motivo, com a contagem esperada de objetos. */
void esperarRecusa(const ShadowGateResult& r, ShadowGateRefusal motivo, int32_t objetos) {
  CHECK(!r.accepted);
  CHECK(r.reason == motivo);
  CHECK(r.offenders == objetos);
  CHECK(r.counts[static_cast<size_t>(motivo)] == objetos);
}

/** Um caster com o bit pedido tem de derrubar o gate pelo motivo pedido. */
void casterComBitRecusa(scene::NodeFlag bit, ShadowGateRefusal motivo) {
  std::vector<NodeDesc> nos;
  nos.push_back(casterAceito());
  NodeDesc marcado = casterAceito();
  marcado.flags = static_cast<uint16_t>(marcado.flags | bit);
  nos.push_back(marcado);

  const ShadowGateResult r = avaliar(nos, frameLimpo(nos.size()));
  esperarRecusa(r, motivo, 1);
  // O caster bom nao e arrastado junto: a contagem diz UM objeto, nao dois.
  CHECK(r.totalCasters == 2);
  CHECK(r.refusedCasters == 1);
}

}  // namespace

namespace tests {

void testShadowGateAceitaCenaLimpa() {
  // A linha de base. Sem ela, um gate que recusa SEMPRE passaria em todos os
  // testes de recusa abaixo e ninguem notaria.
  std::vector<NodeDesc> nos;
  nos.push_back(casterAceito());
  nos.push_back(casterAceito());

  const ShadowGateResult r = avaliar(nos, frameLimpo(nos.size()));
  CHECK(r.accepted);
  CHECK(r.reason == ShadowGateRefusal::kNone);
  CHECK(r.totalCasters == 2);
  CHECK(r.refusedCasters == 0);
  CHECK(r.offenders == 0);
}

void testShadowGateRecusaSkinnedEInstanced() {
  casterComBitRecusa(scene::kNodeSkinned, ShadowGateRefusal::kSkinnedCaster);
  casterComBitRecusa(scene::kNodeInstanced, ShadowGateRefusal::kInstancedCaster);
}

void testShadowGateRecusaMaterialEmArray() {
  // A RenderList do `three` gera um item POR GRUPO; o registro desenha a
  // geometria inteira. `GeometryEntry` nao guarda drawRange nem grupos.
  casterComBitRecusa(scene::kNodeMaterialArray, ShadowGateRefusal::kMaterialArray);
}

void testShadowGateRecusaRecorteAlfaEPositionNode() {
  // O `three` COPIA alphaTest/alphaMap e positionNode para o material do passe
  // de sombra, entao a silhueta dele nao e a da geometria crua.
  casterComBitRecusa(scene::kNodeAlphaClip, ShadowGateRefusal::kAlphaClip);
  casterComBitRecusa(scene::kNodePositionNode, ShadowGateRefusal::kPositionNode);
}

void testShadowGateRecusaGeometriaAusenteDoRegistro() {
  // Os GPUBuffer so existem depois de o `three` subir a geometria, entao o
  // registro (E2) enche ao longo dos primeiros frames. Enquanto nao encheu, o
  // gate tem de recusar — desenhar um caster sem buffer e nao desenhar nada.
  std::vector<NodeDesc> nos;
  nos.push_back(casterAceito());
  NodeDesc semRegistro = casterAceito();
  semRegistro.geometryId = kGeometriaRegistrada + 1;  // existe, mas nao registrada
  nos.push_back(semRegistro);
  NodeDesc semGeometria = casterAceito();
  semGeometria.geometryId = scene::kNoGeometry;
  nos.push_back(semGeometria);

  const ShadowGateResult r = avaliar(nos, frameLimpo(nos.size()));
  esperarRecusa(r, ShadowGateRefusal::kGeometryMissing, 2);
  CHECK(r.totalCasters == 3);
}

void testShadowGateRecusaSemRegistroNenhum() {
  // `presence == nullptr` e o estado antes de o registro existir. Tem de cair
  // para o lado seguro (recusar tudo), nao para "nada a conferir, aceito".
  std::vector<NodeDesc> nos;
  nos.push_back(casterAceito());
  SceneMirror espelho;
  CHECK(espelho.build(nos));
  const auto planos = planosAmplos();
  espelho.updateAndCull(identidade, planos.data());
  ShadowCasterEnumerator enumerador;
  enumerador.enumerate(espelho, ShadowCasterParams{}, planos.data());

  const ShadowGateResult r = scene::evaluateShadowPassGate(espelho, enumerador.casters(),
                                                           frameLimpo(nos.size()), nullptr, nullptr);
  esperarRecusa(r, ShadowGateRefusal::kGeometryMissing, 1);
}

void testShadowGateRecusaDivergenciaDeNos() {
  // Medido no kart-racer: 977 nos na cena contra 975 no espelho. Com o passe
  // nativo no lugar do `three`, o no que falta vira SOMBRA FALTANDO.
  std::vector<NodeDesc> nos;
  nos.push_back(casterAceito());

  ShadowGateFrame frame = frameLimpo(nos.size() + 2);  // a cena cresceu 2 nos
  const ShadowGateResult r = avaliar(nos, frame);
  esperarRecusa(r, ShadowGateRefusal::kNodeCountDivergence, 2);

  // Tambem na outra direcao: no removido da cena e divergencia igual.
  std::vector<NodeDesc> dois;
  dois.push_back(casterAceito());
  dois.push_back(casterAceito());
  ShadowGateFrame menor = frameLimpo(1);
  esperarRecusa(avaliar(dois, menor), ShadowGateRefusal::kNodeCountDivergence, 1);

  // `sceneNodeCount` negativo = nao medido neste frame: nao inventa recusa.
  ShadowGateFrame semMedida;
  semMedida.sceneNodeCount = -1;
  CHECK(avaliar(nos, semMedida).accepted);
}

void testShadowGateRecusaDivergenciaSemCasterNenhum() {
  // A divergencia e um fato do FRAME: vale mesmo com a lista de casters vazia,
  // porque o no que falta no espelho pode ser justamente o que projetaria.
  std::vector<NodeDesc> nos;
  NodeDesc naoCaster = casterAceito();
  naoCaster.flags = scene::kNodeDrawable;  // sem castShadow autorado
  nos.push_back(naoCaster);

  const ShadowGateResult r = avaliar(nos, frameLimpo(nos.size() + 1));
  CHECK(r.totalCasters == 0);
  esperarRecusa(r, ShadowGateRefusal::kNodeCountDivergence, 1);
}

void testShadowGateRecusaVsm() {
  // Desligar o passe do `three` (E6) e o que deixa de limpar a RT de cor do
  // shadow map. Irrelevante com PCF/PCFSoft, mas o tipo e configuravel.
  std::vector<NodeDesc> nos;
  nos.push_back(casterAceito());
  ShadowGateFrame frame = frameLimpo(nos.size());
  frame.vsmShadowMap = true;

  esperarRecusa(avaliar(nos, frame), ShadowGateRefusal::kVsmShadowMap, 1);
}

void testShadowGatePrioridadeEContagemPorMotivo() {
  // Um caster pode cair em varias condicoes. O relato tem de trazer TODAS as
  // contagens, senao tirar a primeira causa so revelaria a proxima num
  // proximo ciclo de investigacao.
  std::vector<NodeDesc> nos;
  NodeDesc duplo = casterAceito();
  duplo.flags = static_cast<uint16_t>(duplo.flags | scene::kNodeSkinned | scene::kNodeAlphaClip);
  nos.push_back(duplo);
  NodeDesc soAlfa = casterAceito();
  soAlfa.flags = static_cast<uint16_t>(soAlfa.flags | scene::kNodeAlphaClip);
  nos.push_back(soAlfa);

  const ShadowGateResult r = avaliar(nos, frameLimpo(nos.size()));
  CHECK(r.reason == ShadowGateRefusal::kSkinnedCaster);  // prioridade
  CHECK(r.counts[static_cast<size_t>(ShadowGateRefusal::kSkinnedCaster)] == 1);
  CHECK(r.counts[static_cast<size_t>(ShadowGateRefusal::kAlphaClip)] == 2);
  // Dois casters recusados, tres marcacoes de motivo: o caster duplo conta uma
  // vez em `refusedCasters` e duas nas contagens.
  CHECK(r.refusedCasters == 2);
  CHECK(r.totalCasters == 2);

  // Os fatos do frame vencem os motivos por caster no relato.
  ShadowGateFrame comVsm = frameLimpo(nos.size());
  comVsm.vsmShadowMap = true;
  CHECK(avaliar(nos, comVsm).reason == ShadowGateRefusal::kVsmShadowMap);
}

void testShadowGateMotivoTemNome() {
  // O gate tem de ser observavel sem depurador: o motivo vira texto no log.
  CHECK(std::strcmp(scene::shadowGateRefusalName(ShadowGateRefusal::kNone), "aceito") == 0);
  CHECK(std::strcmp(scene::shadowGateRefusalName(ShadowGateRefusal::kSkinnedCaster), "skinned") ==
        0);
  CHECK(std::strcmp(scene::shadowGateRefusalName(ShadowGateRefusal::kGeometryMissing),
                    "geometria-ausente") == 0);
  CHECK(std::strcmp(scene::shadowGateRefusalName(ShadowGateRefusal::kNodeCountDivergence),
                    "divergencia-de-nos") == 0);
}

void testShadowGateAtalhoSoValeParaDivergenciaDeNos() {
  // ATALHO DE MEDICAO (SPEC-0245): so a divergencia de nos pode ser ignorada,
  // e so quando ela e a UNICA recusa. Qualquer outro motivo junto tem de
  // fechar a porta — aceitar por engano e sombra errada na imagem do jogador.
  std::vector<NodeDesc> nos;
  nos.push_back(casterAceito());

  // 1. Divergencia sozinha: o atalho se aplica.
  ShadowGateFrame comDeriva = frameLimpo(nos.size() + 2);
  const ShadowGateResult soDeriva = avaliar(nos, comDeriva);
  CHECK(!soDeriva.accepted);
  CHECK(soDeriva.reason == ShadowGateRefusal::kNodeCountDivergence);
  CHECK(scene::refusalIsOnlyNodeDivergence(soDeriva));

  // 2. Divergencia + caster skinado: NAO se aplica.
  std::vector<NodeDesc> comSkinado;
  comSkinado.push_back(casterAceito());
  NodeDesc skinado = casterAceito();
  skinado.flags = static_cast<uint16_t>(skinado.flags | scene::kNodeSkinned);
  comSkinado.push_back(skinado);
  const ShadowGateResult duplo =
      avaliar(comSkinado, frameLimpo(comSkinado.size() + 2));
  CHECK(duplo.reason == ShadowGateRefusal::kNodeCountDivergence);  // prioridade
  CHECK(!scene::refusalIsOnlyNodeDivergence(duplo));

  // 3. Frame aceito: nao ha atalho a aplicar.
  CHECK(!scene::refusalIsOnlyNodeDivergence(avaliar(nos, frameLimpo(nos.size()))));

  // 4. Outra recusa sozinha: o atalho nao a cobre.
  std::vector<NodeDesc> soSkinado;
  soSkinado.push_back(skinado);
  const ShadowGateResult semDeriva = avaliar(soSkinado, frameLimpo(soSkinado.size()));
  CHECK(semDeriva.reason == ShadowGateRefusal::kSkinnedCaster);
  CHECK(!scene::refusalIsOnlyNodeDivergence(semDeriva));
}

}  // namespace tests
