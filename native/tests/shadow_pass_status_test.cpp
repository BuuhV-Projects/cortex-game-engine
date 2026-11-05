// Testes do status do passe de sombra por cascata (SPEC-0690, item 3).
//
// O `drawShadowCasters` devolvia 0 para tres casos opostos. A decisao saiu para
// uma funcao pura, e e ela que estes testes exercitam: o desenho de verdade
// precisa de GPU, mas QUAL dos tres casos cada lista e decide-se sem ela.
#include "../src/render/shadow_pass_status.h"

#include "harness.h"

#include <cstddef>
#include <iterator>
#include <vector>

namespace {

using render::assignShadowSlots;
using render::classifyShadowPass;
using render::kNoShadowSlot;
using render::planShadowPass;
using render::ShadowPassStep;
using render::ShadowItemFacts;
using render::ShadowItemFate;
using render::ShadowPassStatus;
using render::shadowItemFate;
using render::shadowPassWritesTarget;

/** Itens de uma lista de exemplo. */
constexpr uint32_t kItens = 3;
/** Instancias de um lote instanciado nao vazio. */
constexpr uint32_t kInstancias = 4;

/** Quantos passos `passo` ha no roteiro. */
size_t contar(const std::vector<ShadowPassStep>& plano, ShadowPassStep passo) {
  size_t n = 0;
  for (const ShadowPassStep p : plano) n += p == passo ? 1 : 0;
  return n;
}

/**
 * O roteiro de uma cascata e valido: abre primeiro, submete por ultimo, e todo
 * uniforme e escrito antes de qualquer draw e, portanto, antes do submit dela.
 */
bool roteiroValido(const std::vector<ShadowPassStep>& plano, size_t casters) {
  if (plano.size() < 2 || plano.front() != ShadowPassStep::kOpen ||
      plano.back() != ShadowPassStep::kSubmit) {
    return false;
  }
  bool desenhou = false;
  for (size_t i = 1; i + 1 < plano.size(); ++i) {
    if (plano[i] == ShadowPassStep::kDraw) desenhou = true;
    if (plano[i] == ShadowPassStep::kWriteUniform && desenhou) return false;
    if (plano[i] == ShadowPassStep::kOpen || plano[i] == ShadowPassStep::kSubmit) return false;
  }
  return contar(plano, ShadowPassStep::kWriteUniform) == casters &&
         contar(plano, ShadowPassStep::kDraw) == casters;
}

}  // namespace

namespace tests {

void testShadowPassVazioLimpaOAlvo() {
  // Cascata sem casters e LIMPA: sem isso a sombra do quadro anterior ficaria.
  CHECK(classifyShadowPass(0, 0, 0) == ShadowPassStatus::kClearedEmpty);
  CHECK(shadowPassWritesTarget(ShadowPassStatus::kClearedEmpty));
}

void testShadowPassGeometriaAusenteNaoEstaProntoESemLimpar() {
  CHECK(classifyShadowPass(kItens, 1, 0) == ShadowPassStatus::kNotReady);
  CHECK(classifyShadowPass(kItens, kItens, 0) == ShadowPassStatus::kNotReady);
  // A geometria ausente vence o vazio: limpar apagaria a sombra que falta subir.
  CHECK(classifyShadowPass(kItens, 1, kItens - 1) == ShadowPassStatus::kNotReady);
  CHECK(!shadowPassWritesTarget(ShadowPassStatus::kNotReady));
  CHECK(!shadowPassWritesTarget(ShadowPassStatus::kRefused));
  CHECK(!shadowPassWritesTarget(ShadowPassStatus::kSkipped));
}

void testShadowPassLoteVazioELegitimo() {
  // `instanceCount == 0` e pulado em silencio; so lotes vazios = cascata vazia.
  CHECK(classifyShadowPass(kItens, 0, 1) == ShadowPassStatus::kOk);
  CHECK(classifyShadowPass(kItens, 0, kItens) == ShadowPassStatus::kClearedEmpty);
  CHECK(classifyShadowPass(kItens, 0, 0) == ShadowPassStatus::kOk);
  CHECK(shadowPassWritesTarget(ShadowPassStatus::kOk));
}

void testShadowPassStatusSegueOContrato() {
  // Os codigos vao para o JS em `kGateOutStatus` (mirrorBridge.ts).
  CHECK(static_cast<int>(ShadowPassStatus::kOk) == 0);
  CHECK(static_cast<int>(ShadowPassStatus::kClearedEmpty) == 1);
  CHECK(static_cast<int>(ShadowPassStatus::kNotReady) == 2);
  CHECK(static_cast<int>(ShadowPassStatus::kRefused) == 3);
  CHECK(static_cast<int>(ShadowPassStatus::kSkipped) == 4);
  // No slot vai o codigo + 1: o 0 e "nada escrito" (host antigo, vetor zerado).
  CHECK(shadowStatusSlot(ShadowPassStatus::kOk) == 1.0);
  CHECK(shadowStatusSlot(ShadowPassStatus::kSkipped) == 5.0);
}

void testShadowItemFateContaOsDescartes() {
  ShadowItemFacts comum;
  CHECK(shadowItemFate(comum) == ShadowItemFate::kDraw);

  ShadowItemFacts semGeometria;
  semGeometria.hasGeometry = false;
  CHECK(shadowItemFate(semGeometria) == ShadowItemFate::kSkipped);

  ShadowItemFacts semLote;
  semLote.instanced = true;
  CHECK(shadowItemFate(semLote) == ShadowItemFate::kSkipped);

  ShadowItemFacts loteVazio;
  loteVazio.instanced = true;
  loteVazio.batchFound = true;
  CHECK(shadowItemFate(loteVazio) == ShadowItemFate::kEmpty);  // vazio legitimo, nao descarte

  ShadowItemFacts lote = loteVazio;
  lote.batchCount = kInstancias;
  CHECK(shadowItemFate(lote) == ShadowItemFate::kDraw);

  ShadowItemFacts semRecorte;
  semRecorte.alphaClip = true;
  CHECK(shadowItemFate(semRecorte) == ShadowItemFate::kSkipped);
  semRecorte.alphaClipFound = true;
  CHECK(shadowItemFate(semRecorte) == ShadowItemFate::kDraw);
}

}  // namespace tests

namespace tests {

void testShadowPassDuasCascatasNoMesmoQuadro() {
  // Duas cascatas de tamanhos diferentes no mesmo quadro, em alvos diferentes:
  // cada chamada recomeca os slots do 0, pulando os lotes vazios.
  const uint32_t cascata0[] = {1, 0, kInstancias, 1};
  const uint32_t cascata1[] = {kInstancias, 1};
  std::vector<uint32_t> slots0;
  std::vector<uint32_t> slots1;
  const auto total1 = static_cast<uint32_t>(std::size(cascata1));
  const uint32_t n0 = assignShadowSlots(cascata0, static_cast<uint32_t>(std::size(cascata0)), slots0);
  const uint32_t n1 = assignShadowSlots(cascata1, total1, slots1);
  CHECK(n0 == kItens);  // o lote vazio nao ganha slot
  CHECK(slots0[0] == 0 && slots0[1] == kNoShadowSlot && slots0[2] == 1 && slots0[3] == 2);
  CHECK(n1 == total1);
  CHECK(slots1[0] == 0 && slots1[1] == 1);

  // Como os slots se repetem, cada cascata escreve TODOS os uniformes dela antes
  // do proprio submit: nenhuma escrita entre o submit da 0 e os draws dela.
  CHECK(roteiroValido(planShadowPass(ShadowPassStatus::kOk, n0), n0));
  CHECK(roteiroValido(planShadowPass(ShadowPassStatus::kOk, n1), n1));
}

void testShadowPassPlanoLimpaENaoSubmete() {
  // Vazio: abre e submete (limpa), sem draw nem uniforme.
  const std::vector<ShadowPassStep> limpa = planShadowPass(ShadowPassStatus::kClearedEmpty, kItens);
  CHECK(roteiroValido(limpa, 0));  // so kOpen e kSubmit
  // Nao pronto, recusado e descartado: nada e aberto nem submetido.
  CHECK(planShadowPass(ShadowPassStatus::kNotReady, kItens).empty());
  CHECK(planShadowPass(ShadowPassStatus::kRefused, kItens).empty());
  CHECK(planShadowPass(ShadowPassStatus::kSkipped, kItens).empty());
}

}  // namespace tests
