// Ver alpha_clip_table.h (SPEC-0642; posse: ADR-0692).
#include "alpha_clip_table.h"

namespace render {

void releaseAlphaClipObjects(const AlphaClipReleaseOps& ops, AlphaClipEntry& entry) {
  // Contagem de referência do wgpu: o que já foi submetido sobrevive até a GPU terminar.
  if (entry.bindGroup && ops.releaseBindGroup) ops.releaseBindGroup(entry.bindGroup);
  if (entry.view && ops.releaseView) ops.releaseView(entry.view);
  entry.bindGroup = nullptr;
  entry.view = nullptr;
}

void AlphaClipTable::release(AlphaClipEntry& entry) const {
  releaseAlphaClipObjects(ops_, entry);
  releaseBuffer(ops_.buffers, entry.uvBuffer);
  entry = AlphaClipEntry{};
}

void AlphaClipTable::put(int32_t node, const AlphaClipEntry& entry) {
  // AddRef ANTES de soltar a antiga: o mesmo UV re-registrado não zera a contagem.
  retainBuffer(ops_.buffers, entry.uvBuffer);
  const auto it = entries_.find(node);
  if (it != entries_.end()) {
    release(it->second);
    it->second = entry;
  } else {
    entries_.emplace(node, entry);
  }
}

const AlphaClipEntry* AlphaClipTable::find(int32_t node) const {
  const auto it = entries_.find(node);
  return it == entries_.end() ? nullptr : &it->second;
}

void AlphaClipTable::erase(int32_t node) {
  const auto it = entries_.find(node);
  if (it == entries_.end()) return;
  release(it->second);
  entries_.erase(it);
}

void AlphaClipTable::clear() {
  for (auto& [node, entry] : entries_) release(entry);
  entries_.clear();
}

}  // namespace render
