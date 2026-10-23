// Testes da fila opaca nativa intercalada (ADR-0363): ordem do
// `painterSortStable` e o corte "até a chave" do merge com a RenderList.
#include "../src/render/opaque_queue.h"

#include "harness.h"

namespace {

using render::DrawCommand;
using render::OpaqueQueue;
using render::SortKey;

}  // namespace

namespace tests {

void testOpaqueQueueOrdemDoPainterSortStable() {
  // renderOrder vence z, z vence id; o id desempata.
  const DrawCommand cmds[] = {{1, 3, 1, 0}, {2, 3, 1, 0}, {3, 3, 1, 0}, {4, 3, 1, 0}};
  const SortKey keys[] = {{0, 5.0, 10}, {1, -9.0, 1}, {0, 2.0, 30}, {0, 2.0, 20}};
  OpaqueQueue q;
  q.set(cmds, keys, 4);
  const render::QueueSpan all = q.takeAll();
  CHECK(all.count == 4);
  CHECK(all.commands[0].recipe == 4);  // z 2, id 20
  CHECK(all.commands[1].recipe == 3);  // z 2, id 30
  CHECK(all.commands[2].recipe == 1);  // z 5
  CHECK(all.commands[3].recipe == 2);  // renderOrder 1
  CHECK(q.pending() == 0);
}

void testOpaqueQueueCorteAteAChaveDoItemDoThree() {
  const DrawCommand cmds[] = {{1, 3, 1, 0}, {2, 3, 1, 0}, {3, 3, 1, 0}};
  const SortKey keys[] = {{0, 1.0, 1}, {0, 3.0, 3}, {0, 5.0, 5}};
  OpaqueQueue q;
  q.set(cmds, keys, 3);
  // Item do three com z 0: nada da fila vem antes dele.
  CHECK(q.takeUntil({0, 0.0, 9}).count == 0);
  // z 4: os de z 1 e 3, em ordem.
  const render::QueueSpan s = q.takeUntil({0, 4.0, 4});
  CHECK(s.count == 2 && s.commands[0].recipe == 1 && s.commands[1].recipe == 2);
  // Mesmo z: o id decide (5 < 6 sai; com id 4 não sairia).
  CHECK(q.takeUntil({0, 5.0, 4}).count == 0);
  CHECK(q.takeUntil({0, 5.0, 6}).count == 1);
  CHECK(q.takeAll().count == 0);
  // Quadro novo: a fila é trocada inteira.
  q.set(cmds, keys, 1);
  CHECK(q.pending() == 1);
}

}  // namespace tests
