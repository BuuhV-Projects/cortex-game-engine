// Fila opaca nativa intercalada (ADR-0363, SPEC-0333 b.3).
//
// Os desenhos opacos limpos e parados saem da RenderList do `three`: o JS os
// oferece na projeção, a fila os ordena aqui pela MESMA regra do
// `painterSortStable` do three (`renderOrder`, `z`, `id` — `groupOrder` é 0 na
// chamada de topo), e o passe os emite intercalados com os itens do `three`:
// antes de cada item dele, os desta fila de chave menor.
//
// Parte PURA (sem wgpu): o shim emite o trecho devolvido com o `replay` da b.2.
#pragma once

#include <cstddef>
#include <vector>

#include "draw_batch.h"

namespace render {

/** Chave de sort de um item (a do `painterSortStable`). */
struct SortKey {
  double renderOrder = 0;
  double z = 0;
  double id = 0;
};

/** Doubles por chave no buffer que o JS escreve (ver {@link SortKey}). */
constexpr int kSortKeyDoubles = 3;

/** `a` vem antes de `b` no `painterSortStable` (ordem total: o `id` desempata). */
bool keyLess(const SortKey& a, const SortKey& b);

/** Um trecho contíguo da fila ordenada. */
struct QueueSpan {
  const DrawCommand* commands = nullptr;
  size_t count = 0;
};

class OpaqueQueue {
 public:
  /** Troca a fila do quadro, ordenando estável pela chave. */
  void set(const DrawCommand* commands, const SortKey* keys, size_t count);

  /** O que falta emitir com chave menor que `limit`; avança o cursor. */
  QueueSpan takeUntil(const SortKey& limit);

  /** Todo o resto; esvazia. */
  QueueSpan takeAll();

  size_t pending() const { return sorted_.size() - next_; }

 private:
  std::vector<DrawCommand> sorted_;
  std::vector<SortKey> keys_;
  std::vector<size_t> order_;
  size_t next_ = 0;
};

}  // namespace render
