// Estado por slot que só o passe PRINCIPAL usa (SPEC-0686): a máscara de
// camadas do nó e, para quem o `three` corta pela esfera do OBJETO
// (`InstancedMesh`, `SkinnedMesh`, `BatchedMesh`), essa esfera.
//
// Fica fora do `SceneMirror` pelo mesmo motivo do `WorldVersions` (ADR-0683):
// só a projeção lê, e o espelho é de todos os passes.
#pragma once

#include <cstddef>
#include <cstdint>
#include <vector>

#include "scene_mirror.h"

namespace scene {

/** Máscara de um `new Layers()` do `three` (`1 | 0`): a de todo slot nunca escrito. */
constexpr uint32_t kDefaultLayers = 1;
/** Máscara de câmera que aceita qualquer camada não vazia (JS que não passa a dele). */
constexpr uint32_t kAllLayers = 0xFFFFFFFFu;

/**
 * Esfera com que o `three` corta o nó (`Frustum.intersectsObject`: a do objeto)
 * e o centro com que ele calcula o `z` (o da esfera da GEOMETRIA). Locais.
 */
struct ObjectSphere {
  Bounds cull;
  double depthX = 0;
  double depthY = 0;
  double depthZ = 0;
};

class MainPassSlots {
 public:
  /** Máscara de camadas do slot (`kDefaultLayers` se nunca escrita). */
  uint32_t layers(NodeIndex index) const {
    const auto i = static_cast<size_t>(index);
    return i < layers_.size() ? layers_[i] : kDefaultLayers;
  }

  void setLayers(NodeIndex index, uint32_t mask);

  /** A esfera do objeto do slot, ou `nullptr` (o JS corta o nó). */
  const ObjectSphere* objectSphere(NodeIndex index) const {
    const auto i = static_cast<size_t>(index);
    return i < hasSphere_.size() && hasSphere_[i] != 0 ? &spheres_[i] : nullptr;
  }

  void setObjectSphere(NodeIndex index, const ObjectSphere& sphere);
  void clearObjectSphere(NodeIndex index);

  /** Esquece tudo: o espelho foi reconstruído e os slots são de outros nós. */
  void reset();

 private:
  std::vector<uint32_t> layers_;
  std::vector<ObjectSphere> spheres_;
  std::vector<uint8_t> hasSphere_;
};

}  // namespace scene
