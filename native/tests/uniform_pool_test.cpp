// Testes do pool de uniformes (SPEC-0239).
//
// Sem device: o que se prova aqui é a POLÍTICA — quem escreve e quem não
// escreve —, que é onde mora o critério do marco.
#include "../src/render/uniform_pool.h"

#include "harness.h"

namespace tests {

void testUniformPoolAlinhaOsSlots() {
  render::UniformPool pool;
  pool.resize(3);

  // Offset dinâmico do WebGPU exige múltiplo de 256; um slot colado no outro
  // seria recusado pelo driver.
  CHECK(pool.offsetOf(0) == 0);
  CHECK(pool.offsetOf(1) == render::kUniformSlotAlign);
  CHECK(pool.offsetOf(2) == render::kUniformSlotAlign * 2);
  CHECK(pool.byteSize() == render::kUniformSlotAlign * 3);
}

void testUniformPoolEscreveSoQuemMudou() {
  // É o critério do M3: `writeBuffer` proporcional ao que se MOVEU, não ao
  // total de objetos.
  render::UniformPool pool;
  pool.resize(1000);
  pool.clearPending();  // descarta a marcação inicial da cena nova

  pool.markDirty(7);
  pool.markDirty(500);

  CHECK(pool.pendingWrites().size() == 2);
  CHECK(pool.pendingWrites()[0] == 7);
  CHECK(pool.pendingWrites()[1] == 500);
}

void testUniformPoolNaoDuplicaMarcacao() {
  // Objeto tocado por dois sistemas no mesmo frame custaria duas escritas.
  render::UniformPool pool;
  pool.resize(10);
  pool.clearPending();

  pool.markDirty(3);
  pool.markDirty(3);

  CHECK(pool.pendingWrites().size() == 1);
}

void testUniformPoolFrameParadoNaoEscreveNada() {
  // Cena sem movimento: zero escritas. Com um anel por frame seriam 1.000.
  render::UniformPool pool;
  pool.resize(1000);
  pool.clearPending();

  CHECK(pool.pendingWrites().empty());
}

void testUniformPoolCenaNovaMarcaTudo() {
  // Buffer novo não tem conteúdo válido: desenhar sem escrever mostraria lixo.
  render::UniformPool pool;
  pool.resize(4);

  CHECK(pool.pendingWrites().size() == 4);
}

void testUniformPoolIgnoraSlotForaDaFaixa() {
  render::UniformPool pool;
  pool.resize(2);
  pool.clearPending();

  pool.markDirty(99);
  pool.markDirty(-1);

  CHECK(pool.pendingWrites().empty());
}

}  // namespace tests
