// Ver instance_buffer_store.h (SPEC-0289).
#include "instance_buffer_store.h"

#include "../core/host_gpu.h"

namespace render {
namespace {
/** Capacidade mínima: um lote vazio agora ainda ganha buffer válido. */
constexpr uint32_t kCapacidadeMinima = 1;
}  // namespace

void InstanceBufferStore::release(InstanceSet& set) {
  // O wgpu conta referência: um buffer já usado num command buffer submetido
  // sobrevive até a GPU terminar, então soltar aqui é seguro.
  if (set.buffer) wgpuBufferRelease(set.buffer);
  set = InstanceSet{};
}

bool InstanceBufferStore::upload(HostGpu* gpu, int32_t node, const float* matrices,
                                 uint32_t count) {
  if (!gpu || !gpu->device || !gpu->queue) return false;
  InstanceSet& set = sets_[node];
  if (count > set.capacity || set.buffer == nullptr) {
    release(set);
    const uint32_t capacity = count > kCapacidadeMinima ? count : kCapacidadeMinima;
    WGPUBufferDescriptor bd = WGPU_BUFFER_DESCRIPTOR_INIT;
    bd.size = static_cast<uint64_t>(capacity) * kInstanceStrideBytes;
    bd.usage = WGPUBufferUsage_Vertex | WGPUBufferUsage_CopyDst;
    set.buffer = wgpuDeviceCreateBuffer(gpu->device, &bd);
    if (!set.buffer) {
      sets_.erase(node);
      return false;
    }
    set.capacity = capacity;
  }
  set.count = count;
  if (count > 0 && matrices != nullptr) {
    wgpuQueueWriteBuffer(gpu->queue, set.buffer, 0, matrices,
                         static_cast<size_t>(count) * kInstanceStrideBytes);
  }
  return true;
}

const InstanceSet* InstanceBufferStore::find(int32_t node) const {
  const auto it = sets_.find(node);
  return it == sets_.end() ? nullptr : &it->second;
}

void InstanceBufferStore::erase(int32_t node) {
  const auto it = sets_.find(node);
  if (it == sets_.end()) return;
  release(it->second);
  sets_.erase(it);
}

void InstanceBufferStore::clear() {
  for (auto& [node, set] : sets_) release(set);
  sets_.clear();
}

}  // namespace render
