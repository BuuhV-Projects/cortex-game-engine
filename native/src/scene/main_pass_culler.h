// Projeção do passe PRINCIPAL em C++ (SPEC-0332, etapa (a) do ADR-0330).
//
// Reproduz o `_projectObject` do `three` sobre o espelho: visibilidade herdada
// (pai invisível poda a subárvore), culling pela esfera da geometria e o `z`
// de ordenação — o JS recebe só a lista de candidatos e monta a RenderList,
// sem percorrer os ~10 mil nós da cena.
#pragma once

#include <cstdint>
#include <vector>

#include "scene_mirror.h"

namespace scene {

/** Floats de uma matriz view-projection (4x4, coluna-maior como no three). */
constexpr int kViewProjFloats = 16;

/** Devolvido por {@link MainPassCuller::cull} quando a projeção é recusada. */
constexpr int kMainCullRefused = -1;

/**
 * Um candidato da projeção: o índice do nó e o `z` de ordenação do `three`.
 *
 * `z` vale para {@link kNodeMainCull}; para os de culling em JS e as luzes o
 * JS calcula (ou ignora) — aqui vai 0.
 */
struct MainCandidate {
  NodeIndex index = 0;
  double z = 0;
};

class MainPassCuller {
 public:
  /**
   * Projeta a cena.
   *
   * @param mirror   espelho já atualizado no frame (matrizes de mundo em dia)
   * @param planes   6 planos do frustum da câmera, 4 doubles cada, em mundo —
   *                 derivados pelo JS com o `coordinateSystem` da câmera
   * @param viewProj `projectionMatrix × matrixWorldInverse` (16 doubles)
   * @return quantos candidatos, ou {@link kMainCullRefused} se um nó
   *         alcançável tem {@link kMainUnsupported} (o `three` projeta)
   */
  int cull(const SceneMirror& mirror, const double* planes, const double* viewProj);

  const std::vector<MainCandidate>& candidates() const { return candidates_; }

  /** Nó que causou a última recusa, ou {@link kNoParent}. */
  NodeIndex refusedAt() const { return refusedAt_; }

 private:
  std::vector<uint8_t> effectiveVisible_;
  std::vector<MainCandidate> candidates_;
  NodeIndex refusedAt_ = kNoParent;
};

/**
 * O `z` que o `_projectObject` usa para ordenar: o centro da esfera em mundo
 * multiplicado pela view-projection, SEM divisão por w (é um `Vector4` com
 * w = 1 em que o `three` não divide).
 */
double sortDepth(const double* viewProj, double x, double y, double z);

}  // namespace scene
