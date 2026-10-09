// Ver draw_batch.h (SPEC-0333, b.2).
#include "draw_batch.h"

namespace render {

int32_t RecipeStore::add(const DrawRecipe& recipe) {
  int32_t id;
  if (!free_.empty()) {
    id = free_.back();
    free_.pop_back();
    recipes_[static_cast<size_t>(id)] = recipe;
    alive_[static_cast<size_t>(id)] = 1;
  } else {
    id = static_cast<int32_t>(recipes_.size());
    recipes_.push_back(recipe);
    alive_.push_back(1);
  }
  live_++;
  return id;
}

bool RecipeStore::remove(int32_t id, DrawRecipe* removed) {
  if (find(id) == nullptr) return false;
  if (removed != nullptr) *removed = recipes_[static_cast<size_t>(id)];
  recipes_[static_cast<size_t>(id)] = DrawRecipe{};
  alive_[static_cast<size_t>(id)] = 0;
  free_.push_back(id);
  live_--;
  return true;
}

const DrawRecipe* RecipeStore::find(int32_t id) const {
  if (id < 0 || static_cast<size_t>(id) >= recipes_.size()) return nullptr;
  if (alive_[static_cast<size_t>(id)] == 0) return nullptr;
  return &recipes_[static_cast<size_t>(id)];
}

namespace {

/** O que o encoder tem agora, do ponto de vista do replay. */
struct EncoderState {
  bool known = false;
  void* pipeline = nullptr;
  std::array<void*, kMaxBindGroups> groups{};
  std::array<void*, kMaxVertexBuffers> vertexBuffers{};
  void* index = nullptr;
  IndexFormat indexFormat = IndexFormat::kNone;
};

void bind(const DrawRecipe& r, EncoderState& s, DrawEmitter& e) {
  if (!s.known || s.pipeline != r.pipeline) {
    e.setPipeline(r.pipeline);
    s.pipeline = r.pipeline;
  }
  for (uint32_t i = 0; i < r.groupCount; i++) {
    if (!s.known || s.groups[i] != r.groups[i]) {
      e.setBindGroup(i, r.groups[i]);
      s.groups[i] = r.groups[i];
    }
  }
  if (r.indexFormat != IndexFormat::kNone &&
      (!s.known || s.index != r.index || s.indexFormat != r.indexFormat)) {
    e.setIndexBuffer(r.index, r.indexFormat);
    s.index = r.index;
    s.indexFormat = r.indexFormat;
  }
  for (uint32_t i = 0; i < r.vertexBufferCount; i++) {
    if (!s.known || s.vertexBuffers[i] != r.vertexBuffers[i]) {
      e.setVertexBuffer(i, r.vertexBuffers[i]);
      s.vertexBuffers[i] = r.vertexBuffers[i];
    }
  }
  s.known = true;
}

}  // namespace

uint32_t replay(const RecipeStore& store, const DrawCommand* commands, size_t count, DrawEmitter& emitter) {
  EncoderState state;
  uint32_t drawn = 0;
  for (size_t i = 0; i < count; i++) {
    const DrawCommand& c = commands[i];
    const DrawRecipe* r = store.find(c.recipe);
    if (r == nullptr || r->pipeline == nullptr) continue;
    bind(*r, state, emitter);
    if (r->indexFormat != IndexFormat::kNone) {
      emitter.drawIndexed(c.count, c.instanceCount, c.first);
    } else {
      emitter.draw(c.count, c.instanceCount, c.first);
    }
    drawn++;
  }
  return drawn;
}

}  // namespace render
