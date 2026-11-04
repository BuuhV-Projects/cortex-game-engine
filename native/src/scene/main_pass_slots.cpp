// Ver main_pass_slots.h (SPEC-0686).
#include "main_pass_slots.h"

namespace scene {

void MainPassSlots::setLayers(NodeIndex index, uint32_t mask) {
  if (index < 0) return;
  const auto i = static_cast<size_t>(index);
  if (i >= layers_.size()) {
    // Escrever o padrão num slot que nunca cresceu não muda nada.
    if (mask == kDefaultLayers) return;
    layers_.resize(i + 1, kDefaultLayers);
  }
  layers_[i] = mask;
}

void MainPassSlots::setObjectSphere(NodeIndex index, const ObjectSphere& sphere) {
  if (index < 0) return;
  const auto i = static_cast<size_t>(index);
  if (i >= hasSphere_.size()) {
    hasSphere_.resize(i + 1, 0);
    spheres_.resize(i + 1);
  }
  spheres_[i] = sphere;
  hasSphere_[i] = 1;
}

void MainPassSlots::clearObjectSphere(NodeIndex index) {
  const auto i = static_cast<size_t>(index);
  if (index >= 0 && i < hasSphere_.size()) hasSphere_[i] = 0;
}

void MainPassSlots::reset() {
  layers_.clear();
  spheres_.clear();
  hasSphere_.clear();
}

}  // namespace scene
