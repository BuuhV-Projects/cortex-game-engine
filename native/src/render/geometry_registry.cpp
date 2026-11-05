// Ver geometry_registry.h (SPEC-0241, passo 2; posse: ADR-0692).
#include "geometry_registry.h"

namespace render {

void GeometryRegistry::releaseEntry(const GeometryEntry& entry) const {
  releaseBuffer(ops_, entry.vertexBuffer);
  releaseBuffer(ops_, entry.indexBuffer);
}

bool GeometryRegistry::set(uint32_t id, const GeometryEntry& entry) {
  // Formato de posicao que o passe de sombra nao le: nao guarda nada, mas lembra
  // o id para o gate relatar o motivo certo.
  if (!entry.positionIsFloat32x3) {
    erase(id);
    positionRefused_.insert(id);
    return false;
  }
  positionRefused_.erase(id);
  // Sem buffer de vertice nao ha o que desenhar; e sem indice NEM contagem de
  // vertice tambem nao. Recusar aqui e melhor do que registrar uma entrada que
  // faria o objeto sumir da imagem sem erro nenhum.
  const bool desenhaIndexado = entry.indexBuffer != nullptr && entry.indexCount > 0;
  const bool desenhaDireto = entry.indexBuffer == nullptr && entry.vertexCount > 0;
  if (!entry.vertexBuffer || (!desenhaIndexado && !desenhaDireto)) {
    erase(id);
    return false;
  }
  // AddRef ANTES do Release: re-registrar o mesmo buffer nao pode zerar a
  // contagem no meio do caminho.
  retainBuffer(ops_, entry.vertexBuffer);
  retainBuffer(ops_, entry.indexBuffer);
  const auto it = entries_.find(id);
  if (it != entries_.end()) {
    releaseEntry(it->second);
    it->second = entry;
  } else {
    entries_.emplace(id, entry);
  }
  return true;
}

const GeometryEntry* GeometryRegistry::find(uint32_t id) const {
  const auto it = entries_.find(id);
  return it == entries_.end() ? nullptr : &it->second;
}

void GeometryRegistry::erase(uint32_t id) {
  positionRefused_.erase(id);
  const auto it = entries_.find(id);
  if (it == entries_.end()) return;
  releaseEntry(it->second);
  entries_.erase(it);
}

void GeometryRegistry::clear() {
  for (const auto& [id, entry] : entries_) releaseEntry(entry);
  entries_.clear();
  positionRefused_.clear();
}

}  // namespace render
