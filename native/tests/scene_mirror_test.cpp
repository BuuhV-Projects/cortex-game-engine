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

/** Cena mínima já construída (raiz + filhos diretos), com a folga pedida. */
SceneMirror comFolga(size_t nos, size_t folga) {
  std::vector<NodeDesc> desc(nos);
  desc[0].parent = kNoParent;
  for (size_t i = 1; i < nos; i++) desc[i].parent = 0;
  SceneMirror espelho;
  espelho.build(desc, folga);
  return espelho;
}

/** Um nó filho de `pai`, deslocado em X para dar o que conferir. */
NodeDesc filhoEm(scene::NodeIndex pai, double x) {
  NodeDesc no;
  no.parent = pai;
  no.transform.px = x;
  return no;
}

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

  // O ultimo campo e o `visible`, que passou a viajar junto (SPEC-0245).
  const double mover[kSyncFloatsPerNode] = {0, 10, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1};
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

  const double fora[kSyncFloatsPerNode] = {99, 5, 5, 5, 0, 0, 0, 1, 1, 1, 1, 1};
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

// ── E6 da SPEC-0245: a cena cresce depois do `install` ──────────────────────

void testSceneMirrorAppendNaoRealocaOBufferDoJs() {
  // O CORAÇÃO do E6: o `ArrayBuffer` externo é criado SEM finalizer e o JS
  // guarda o ponteiro. Se o append realocar, todo `matrixWorld.elements` já
  // entregue passa a apontar para memória liberada — e erro nessa fronteira
  // aparece como artefato visual, não como exceção (SPEC-0234).
  SceneMirror espelho = comFolga(3, 8);
  const double* antes = espelho.worldData();

  std::vector<NodeDesc> lote{filhoEm(1, 5.0)};
  std::vector<scene::NodeIndex> indices;
  CHECK(espelho.appendBatch(lote, indices) == scene::AppendResult::kAppended);

  CHECK(espelho.worldData() == antes);
  CHECK(indices.size() == 1);
  CHECK(indices[0] == 3);
  CHECK(espelho.size() == 4);
  CHECK(espelho.liveCount() == 4);
}

void testSceneMirrorSubarrayEntregueAntesSegueValido() {
  // A promessa de que o JS depende: a fatia que ele recebeu no `install`
  // continua apontando para a matriz do MESMO nó depois de a cena crescer.
  SceneMirror espelho = comFolga(2, 8);
  const auto planos = planosAmplos();
  const double mover[kSyncFloatsPerNode] = {1, 7, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1};
  espelho.applyTransforms(mover, kSyncFloatsPerNode);
  espelho.updateAndCull(identidade, planos.data());
  // É isto que o JS segura: o ponteiro para a fatia do nó 1.
  const double* fatiaDoNo1 = espelho.worldMatrix(1);
  CHECK(std::fabs(fatiaDoNo1[12] - 7.0) < 1e-9);

  std::vector<NodeDesc> lote{filhoEm(0, 1.0), filhoEm(scene::encodeBatchParent(0), 2.0)};
  std::vector<scene::NodeIndex> indices;
  CHECK(espelho.appendBatch(lote, indices) == scene::AppendResult::kAppended);
  espelho.updateAndCull(identidade, planos.data());

  CHECK(espelho.worldMatrix(1) == fatiaDoNo1);
  CHECK(std::fabs(fatiaDoNo1[12] - 7.0) < 1e-9);
  // E o neto veio pela cadeia certa: 1 (pai, no lote) + 2 (ele).
  CHECK(std::fabs(espelho.worldMatrix(indices[1])[12] - 3.0) < 1e-9);
}

void testSceneMirrorAppendMantemPaiAntesDeFilho() {
  // Sem esta ordem a propagação linear leria a matriz de mundo do pai ainda
  // não calculada — matriz errada em silêncio.
  SceneMirror espelho = comFolga(2, 8);
  std::vector<NodeDesc> lote{filhoEm(0, 0.0), filhoEm(scene::encodeBatchParent(0), 0.0)};
  std::vector<scene::NodeIndex> indices;
  CHECK(espelho.appendBatch(lote, indices) == scene::AppendResult::kAppended);
  CHECK(indices[0] < indices[1]);
  CHECK(espelho.parent(indices[1]) == indices[0]);

  // Pai que não existe, e pai que vem DEPOIS no próprio lote: as duas recusam,
  // e nada entra.
  const size_t tamanho = espelho.size();
  std::vector<NodeDesc> foraDaCena{filhoEm(999, 0.0)};
  CHECK(espelho.appendBatch(foraDaCena, indices) == scene::AppendResult::kBadParent);
  std::vector<NodeDesc> invertido{filhoEm(scene::encodeBatchParent(1), 0.0), filhoEm(0, 0.0)};
  CHECK(espelho.appendBatch(invertido, indices) == scene::AppendResult::kBadParent);
  CHECK(espelho.size() == tamanho);
}

void testSceneMirrorEstouroDeCapacidadeRecusaSemRealocar() {
  // Estourar NÃO pode virar realocação silenciosa: prefere-se recusar (e o JS
  // devolve o passe ao `three`) a desenhar sobre memória liberada.
  SceneMirror espelho = comFolga(2, 1);
  const double* antes = espelho.worldData();
  std::vector<scene::NodeIndex> indices;

  std::vector<NodeDesc> um{filhoEm(0, 0.0)};
  CHECK(espelho.appendBatch(um, indices) == scene::AppendResult::kAppended);
  CHECK(espelho.appendBatch(um, indices) == scene::AppendResult::kOutOfCapacity);
  CHECK(espelho.worldData() == antes);
  CHECK(espelho.size() == 3);
  CHECK(espelho.capacity() == 3);

  // E um lote que não cabe INTEIRO não entra pela metade.
  SceneMirror outro = comFolga(1, 2);
  std::vector<NodeDesc> tres{filhoEm(0, 0.0), filhoEm(0, 0.0), filhoEm(0, 0.0)};
  CHECK(outro.appendBatch(tres, indices) == scene::AppendResult::kOutOfCapacity);
  CHECK(outro.size() == 1);
}

void testSceneMirrorRemocaoNaoMexeNoIndiceDosOutros() {
  // O nó que sai vira lápide NO LUGAR. Mudar índice obrigaria a reapontar o
  // `matrixWorld` de todo mundo — o laço em JS que a SPEC-0234 eliminou.
  SceneMirror espelho = comFolga(4, 8);
  const double* fatiaDoNo3 = espelho.worldMatrix(3);

  CHECK(espelho.removeSubtree(2) == 1);

  CHECK(espelho.size() == 4);
  CHECK(espelho.liveCount() == 3);
  CHECK(espelho.removed(2));
  CHECK(!espelho.removed(3));
  CHECK(espelho.worldMatrix(3) == fatiaDoNo3);
  // A lápide some da imagem: sem visível, sem sombra, sem geometria.
  CHECK(!espelho.visibleFlag(2));
  CHECK(espelho.flags(2) == 0);
  CHECK(espelho.geometryId(2) == scene::kNoGeometry);
  // E não ressuscita por linha de sincronização.
  const double ressuscitar[kSyncFloatsPerNode] = {2, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1};
  espelho.applyTransforms(ressuscitar, kSyncFloatsPerNode);
  CHECK(!espelho.visibleFlag(2));
}

void testSceneMirrorRemocaoLevaASubarvoreInteira() {
  // Só a raiz da subárvore recebe `childremoved` no `three`; se os filhos
  // ficassem, seguiriam projetando sombra de um objeto fora da cena.
  std::vector<NodeDesc> desc(4);
  desc[0].parent = kNoParent;
  desc[1].parent = 0;
  desc[2].parent = 1;
  desc[3].parent = 2;
  SceneMirror espelho;
  CHECK(espelho.build(desc, 8));

  CHECK(espelho.removeSubtree(1) == 3);
  CHECK(espelho.liveCount() == 1);
  CHECK(espelho.removed(3));
  // Remover de novo não conta nada nem devolve o slot duas vezes.
  CHECK(espelho.removeSubtree(1) == 0);
  CHECK(espelho.liveCount() == 1);
}

void testSceneMirrorReaproveitaSlotDeLapide() {
  // Sem reaproveitar, cada troca de pai (o `add` do `three` remove do pai
  // antigo antes de pôr no novo) gastaria capacidade para sempre, e um hazard
  // que nasce e morre o tempo todo esvaziaria a folga numa corrida.
  SceneMirror espelho = comFolga(3, 1);
  const auto planos = planosAmplos();
  espelho.updateAndCull(identidade, planos.data());
  CHECK(espelho.removeSubtree(2) == 1);
  CHECK(espelho.liveCount() == 2);

  std::vector<NodeDesc> lote{filhoEm(0, 4.0)};
  std::vector<scene::NodeIndex> indices;
  CHECK(espelho.appendBatch(lote, indices) == scene::AppendResult::kAppended);
  CHECK(indices[0] == 2);  // o slot de volta, não um novo
  CHECK(espelho.size() == 3);
  CHECK(espelho.liveCount() == 3);
  CHECK(!espelho.removed(2));
  // O slot reaproveitado traz a matriz do nó NOVO, não a do que saiu.
  CHECK(std::fabs(espelho.worldMatrix(2)[12] - 4.0) < 1e-9);

  // E um slot que viria ANTES do pai não serve: pai-antes-de-filho primeiro.
  CHECK(espelho.removeSubtree(1) == 1);
  std::vector<NodeDesc> filhoDoDois{filhoEm(2, 0.0)};
  CHECK(espelho.appendBatch(filhoDoDois, indices) == scene::AppendResult::kAppended);
  CHECK(indices[0] > 2);
}

void testSceneMirrorLadoDaSombraVemDoBuildEDoFrame() {
  // O lado da face do passe de sombra (SPEC-0245) segue o caminho do
  // `material.visible`: valor de partida no `build`, valor de verdade por
  // frame. Ele decide o `cullMode` de cada caster, entao um lado velho e
  // sombra desenhada da face errada.
  std::vector<NodeDesc> nos(2);
  nos[0].parent = kNoParent;
  nos[1].parent = 0;
  nos[1].shadowSide = scene::kShadowSideDouble;

  SceneMirror espelho;
  CHECK(espelho.build(nos));
  CHECK(espelho.shadowSide(0) == scene::kShadowSideBack);  // default = material FrontSide
  CHECK(espelho.shadowSide(1) == scene::kShadowSideDouble);

  // O frame manda o lado nos bits altos do campo de flags.
  std::vector<double> sync(kSyncFloatsPerNode * 2, 0.0);
  for (int i = 0; i < 2; i++) {
    double* row = sync.data() + i * kSyncFloatsPerNode;
    row[0] = i;
    row[7] = 1;
    row[8] = row[9] = row[10] = 1;
    row[scene::kSyncFlags] = scene::kSyncVisible | scene::kSyncMaterialVisible |
                             ((i == 0 ? scene::kShadowSideFront : scene::kShadowSideUnsupported)
                              << scene::kSyncShadowSideShift);
  }
  espelho.applyTransforms(sync.data(), sync.size());
  CHECK(espelho.shadowSide(0) == scene::kShadowSideFront);
  CHECK(espelho.shadowSide(1) == scene::kShadowSideUnsupported);
  // Os bits do lado nao contaminam os vizinhos no mesmo campo.
  CHECK(espelho.visibleFlag(0));
  CHECK(espelho.materialVisibleFlag(0));

  // Lapide volta ao valor de partida: o slot pode ser reaproveitado, e um lado
  // herdado do no anterior desenharia a face errada no no novo.
  CHECK(espelho.removeSubtree(1) == 1);
  CHECK(espelho.shadowSide(1) == scene::kShadowSideBack);
}

}  // namespace tests
