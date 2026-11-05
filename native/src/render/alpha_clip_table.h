// Tabela nó → recorte alfa, com a posse do que cada entrada guarda (SPEC-0642;
// posse: ADR-0692, item 5).
//
// Saiu da `AlphaClipStore` para a política de posse ficar testável sem GPU: a
// store cria a view e o bind group (wgpu de verdade), a tabela só guarda e
// solta. O buffer de UV é EMPRESTADO (do `three` ou do `NativeGeometryStore`) e
// a tabela segura uma referência dele enquanto o guarda; view e bind group são
// da tabela desde o `put`.
#pragma once

#include <cstdint>
#include <unordered_map>

#include <webgpu/webgpu.h>

#include "buffer_ref.h"

namespace render {

/** Floats da `map.matrix` do `three` (`Matrix3`, coluna-maior). */
constexpr uint32_t kUvTransformFloats = 9;

/** O recorte de um nó, pronto para o passe. */
struct AlphaClipEntry {
  /** Emprestado; a tabela segura uma referência enquanto guarda a entrada. */
  WGPUBuffer uvBuffer = nullptr;
  uint32_t uvStride = 0;
  uint64_t uvOffset = 0;
  float alphaTest = 0.0f;
  float uvTransform[kUvTransformFloats] = {};
  /** Grupo 1 do pipeline com recorte: textura + sampler. Dono: a tabela. */
  WGPUBindGroup bindGroup = nullptr;
  WGPUTextureView view = nullptr;
};

/** Como soltar o que uma entrada guarda; substituível no teste. */
struct AlphaClipReleaseOps {
  BufferRefOps buffers;
  void (*releaseBindGroup)(WGPUBindGroup group) = nullptr;
  void (*releaseView)(WGPUTextureView view) = nullptr;
};

/** Solta a view e o bind group de uma entrada que NÃO entrou na tabela. */
void releaseAlphaClipObjects(const AlphaClipReleaseOps& ops, AlphaClipEntry& entry);

class AlphaClipTable {
 public:
  explicit AlphaClipTable(const AlphaClipReleaseOps& ops) : ops_(ops) {}
  AlphaClipTable(const AlphaClipTable&) = delete;
  AlphaClipTable& operator=(const AlphaClipTable&) = delete;

  /**
   * Guarda a entrada do nó: `AddRef` do `uvBuffer` novo, e a entrada antiga do
   * nó (se houver) é solta inteira. View e bind group passam a ser da tabela.
   */
  void put(int32_t node, const AlphaClipEntry& entry);

  const AlphaClipEntry* find(int32_t node) const;

  void erase(int32_t node);

  /** Solta os nós para os quais `removed(node)` é verdadeiro (slot virou lápide). */
  template <typename Removed>
  void eraseIf(Removed removed) {
    for (auto it = entries_.begin(); it != entries_.end();) {
      if (removed(it->first)) {
        release(it->second);
        it = entries_.erase(it);
      } else {
        ++it;
      }
    }
  }

  void clear();

  size_t size() const { return entries_.size(); }

 private:
  void release(AlphaClipEntry& entry) const;

  AlphaClipReleaseOps ops_;
  std::unordered_map<int32_t, AlphaClipEntry> entries_;
};

}  // namespace render
