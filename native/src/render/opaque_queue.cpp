// Ver opaque_queue.h (ADR-0363).
#include "opaque_queue.h"

#include <algorithm>

namespace render {

bool keyLess(const SortKey& a, const SortKey& b) {
  if (a.renderOrder != b.renderOrder) return a.renderOrder < b.renderOrder;
  if (a.z != b.z) return a.z < b.z;
  return a.id < b.id;
}

void OpaqueQueue::set(const DrawCommand* commands, const SortKey* keys, size_t count) {
  order_.resize(count);
  for (size_t i = 0; i < count; i++) order_[i] = i;
  std::stable_sort(order_.begin(), order_.end(), [keys](size_t a, size_t b) { return keyLess(keys[a], keys[b]); });
  sorted_.resize(count);
  keys_.resize(count);
  for (size_t i = 0; i < count; i++) {
    sorted_[i] = commands[order_[i]];
    keys_[i] = keys[order_[i]];
  }
  next_ = 0;
}

QueueSpan OpaqueQueue::takeUntil(const SortKey& limit) {
  const size_t start = next_;
  while (next_ < sorted_.size() && keyLess(keys_[next_], limit)) next_++;
  return {sorted_.data() + start, next_ - start};
}

QueueSpan OpaqueQueue::takeAll() {
  const size_t start = next_;
  next_ = sorted_.size();
  return {sorted_.data() + start, next_ - start};
}

}  // namespace render
