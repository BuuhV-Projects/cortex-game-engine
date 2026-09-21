// Registro de geometria do caminho de render nativo (SPEC-0241, passo 2).
//
// O C++ não sabe, sozinho, qual buffer da GPU pertence a qual malha: ele só vê
// `WGPUBuffer` soltos, criados pelo `three` quando o JS desenhou. Este registro
// é a tabela que liga um id estável de geometria aos buffers que ela já tem.
//
// **Os buffers NÃO pertencem a este registro.** Quem os criou e quem os destrói
// é o `three`, pelo caminho normal dele. Guardar o handle aqui é só para
// conseguir gravar `setVertexBuffer`/`setIndexBuffer` sem atravessar a ponte
// por frame — liberar daqui seria destruir o que o `three` ainda usa.
#pragma once

#include <cstdint>
#include <unordered_map>

#include <webgpu/webgpu.h>

namespace render {

/** Os buffers de uma geometria, como o `three` já os criou. */
struct GeometryEntry {
  WGPUBuffer vertexBuffer = nullptr;
  /** `nullptr` quando a malha não é indexada. */
  WGPUBuffer indexBuffer = nullptr;
  /** Quantos índices desenhar; 0 quando não é indexada. */
  uint32_t indexCount = 0;
  /** Quantos vértices desenhar quando não há índice. */
  uint32_t vertexCount = 0;
};

/**
 * Tabela id → buffers. Não é dona de nada: guarda handles emprestados.
 *
 * Testável sem GPU — os handles são opacos, então o harness exercita a política
 * (registrar, encontrar, substituir, remover) com ponteiros falsos.
 */
class GeometryRegistry {
 public:
  /**
   * Registra (ou atualiza) uma geometria. Devolve `false` quando a entrada é
   * inútil — sem buffer de vértice ou sem nada para desenhar —, porque uma
   * geometria que não desenha nada no caminho nativo é um objeto que sumiria da
   * imagem em silêncio, e é melhor recusar e deixá-lo com o `three`.
   */
  bool set(uint32_t id, const GeometryEntry& entry);

  /** Devolve a entrada, ou `nullptr` se o id não está registrado. */
  const GeometryEntry* find(uint32_t id) const;

  /** Esquece a geometria. NÃO libera os buffers — eles são do `three`. */
  void erase(uint32_t id);

  /** Quantas geometrias estão registradas. */
  size_t size() const { return entries_.size(); }

  /** Esquece tudo (troca de cena). Também não libera nada. */
  void clear();

 private:
  std::unordered_map<uint32_t, GeometryEntry> entries_;
};

}  // namespace render
