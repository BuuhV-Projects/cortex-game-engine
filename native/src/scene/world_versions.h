// Versão da matriz de mundo por slot do espelho (SPEC-0682, ADR-0683).
//
// O JS conferia, por candidato da projeção e por quadro, as 16 posições da
// matriz de mundo contra a que tinha gravado (o `matrixMatch` do RS1 e o laço
// de `fround` do renderer nativo). Aqui o C++ faz essa comparação uma vez e
// devolve uma VERSÃO: igual à que o JS adotou, a matriz é a mesma.
#pragma once

#include <cstddef>
#include <cstdint>
#include <vector>

#include "scene_mirror.h"

namespace scene {

/**
 * Versões das matrizes de mundo, pelo CONTEÚDO (ADR-0683).
 *
 * Não rastreia quem escreveu: o JS escreve direto na fatia do mundo
 * (`updateWorldMatrix` sob pedido, SPEC-0340) sem passar pelo sync, e uma
 * versão que só subisse no `updateAndCull` perderia essas escritas. A foto da
 * última matriz vista por slot é comparada com a memória que o `three` lê.
 *
 * O contador é GLOBAL e só cresce: uma versão nunca é dada a dois conteúdos,
 * em nenhum slot. Um objeto que troca de slot (troca de pai, lápide
 * reaproveitada, espelho reconstruído) não encontra por acaso a versão que ele
 * guardou de outro slot.
 */
class WorldVersions {
 public:
  /**
   * A versão da matriz de mundo do slot AGORA: a mesma do último `stamp` se a
   * matriz não mudou desde então; senão, uma nova. Nunca devolve 0.
   */
  uint64_t stamp(const SceneMirror& mirror, NodeIndex index);

  /** Última versão dada (0 = nenhuma ainda). Para os testes. */
  uint64_t counter() const { return counter_; }

 private:
  /** Foto da matriz por slot (16 doubles); nasce `NaN`, que difere de tudo. */
  std::vector<double> photos_;
  std::vector<uint64_t> versions_;
  uint64_t counter_ = 0;

  void grow(size_t slots);
};

}  // namespace scene
