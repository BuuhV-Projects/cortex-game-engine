// Ver geometry_registry.h (SPEC-0241, passo 2).
#include "geometry_registry.h"

namespace render {

bool GeometryRegistry::set(uint32_t id, const GeometryEntry& entry) {
  // Sem buffer de vertice nao ha o que desenhar; e sem indice NEM contagem de
  // vertice tambem nao. Recusar aqui e melhor do que registrar uma entrada que
  // faria o objeto sumir da imagem sem erro nenhum.
  if (!entry.vertexBuffer) return false;
  const bool desenhaIndexado = entry.indexBuffer != nullptr && entry.indexCount > 0;
  const bool desenhaDireto = entry.indexBuffer == nullptr && entry.vertexCount > 0;
  if (!desenhaIndexado && !desenhaDireto) return false;
  entries_[id] = entry;
  return true;
}

const GeometryEntry* GeometryRegistry::find(uint32_t id) const {
  const auto it = entries_.find(id);
  return it == entries_.end() ? nullptr : &it->second;
}

void GeometryRegistry::erase(uint32_t id) { entries_.erase(id); }

void GeometryRegistry::clear() { entries_.clear(); }

}  // namespace render
