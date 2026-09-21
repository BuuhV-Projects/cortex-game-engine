// Ver uniform_pool.h (SPEC-0239).
#include "uniform_pool.h"

namespace render {

void UniformPool::resize(size_t objectCount) {
  if (objectCount == slots_) return;
  slots_ = objectCount;
  dirty_.assign(objectCount, 0);
  pending_.clear();
  pending_.reserve(objectCount);
  // Cena nova (ou crescida): o buffer é outro, então nada do conteúdo anterior
  // vale. Marcar tudo evita desenhar com uniforme de lixo no primeiro frame.
  markAllDirty();
}

void UniformPool::markDirty(int32_t slot) {
  if (slot < 0 || static_cast<size_t>(slot) >= slots_) return;
  auto& flag = dirty_[static_cast<size_t>(slot)];
  if (flag != 0) return;  // já pendente: marcar de novo custaria uma escrita a mais
  flag = 1;
  pending_.push_back(slot);
}

void UniformPool::clearPending() {
  for (const int32_t slot : pending_) dirty_[static_cast<size_t>(slot)] = 0;
  pending_.clear();
}

void UniformPool::markAllDirty() {
  pending_.clear();
  for (size_t i = 0; i < slots_; i++) {
    dirty_[i] = 1;
    pending_.push_back(static_cast<int32_t>(i));
  }
}

}  // namespace render
