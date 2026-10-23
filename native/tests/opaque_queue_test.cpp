// Testes da fila opaca nativa intercalada (ADR-0363): ordem do
// `painterSortStable`, chaves ordenadas para o JS e `takeNext`.
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
  const render::QueueSpan all = q.takeNext(4);
  CHECK(all.count == 4);
  CHECK(all.commands[0].recipe == 4);  // z 2, id 20
  CHECK(all.commands[1].recipe == 3);  // z 2, id 30
  CHECK(all.commands[2].recipe == 1);  // z 5
  CHECK(all.commands[3].recipe == 2);  // renderOrder 1
  CHECK(q.pending() == 0);
}

void testOpaqueQueueChavesOrdenadasETakeNext() {
  const DrawCommand cmds[] = {{1, 3, 1, 0}, {2, 3, 1, 0}, {3, 3, 1, 0}};
  const SortKey keys[] = {{0, 9.0, 1}, {0, 1.0, 2}, {0, 5.0, 3}};
  OpaqueQueue q;
  q.set(cmds, keys, 3);
  CHECK(q.sortedKeys()[0].z == 1.0 && q.sortedKeys()[1].z == 5.0 && q.sortedKeys()[2].z == 9.0);
  const render::QueueSpan a = q.takeNext(2);
  CHECK(a.count == 2 && a.commands[0].recipe == 2 && a.commands[1].recipe == 3);
  CHECK(q.takeNext(5).count == 1);  // só o que falta
  CHECK(q.takeNext(1).count == 0);
}

}  // namespace tests
