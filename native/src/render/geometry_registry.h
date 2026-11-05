// Registro de geometria do caminho de render nativo (SPEC-0241, passo 2).
//
// O C++ não sabe, sozinho, qual buffer da GPU pertence a qual malha: ele só vê
// `WGPUBuffer` soltos, criados pelo `three` quando o JS desenhou. Este registro
// é a tabela que liga um id estável de geometria aos buffers que ela já tem.
//
// Os buffers vêm do `three` ou do `NativeGeometryStore` (ADR-0692). O registro
// SEGURA cada um com `AddRef` enquanto o guarda (ver `buffer_ref.h`): com o store
// nativo, um buffer recriado seria coletado pelo GC e o handle ficaria solto.
// Quem criou continua dono do buffer; o registro só adia a destruição real até
// soltar a referência dele.
#pragma once

#include <cstdint>
#include <unordered_map>
#include <unordered_set>

#include <webgpu/webgpu.h>

#include "buffer_ref.h"

namespace render {

/** Os buffers de uma geometria, como o `three` já os criou. */
struct GeometryEntry {
  WGPUBuffer vertexBuffer = nullptr;
  /** `nullptr` quando a malha não é indexada. */
  WGPUBuffer indexBuffer = nullptr;
  /** Quantos índices desenhar; 0 quando não é indexada. */
  uint32_t indexCount = 0;
  /**
   * `true` quando os índices são de 32 bits. O `three` escolhe 16 ou 32 bits
   * conforme o tamanho da malha, e desenhar com o formato errado não dá erro:
   * lê os bytes tortos e a malha sai deformada. Por isso vem do JS, medido, em
   * vez de presumido.
   */
  bool indexIs32Bit = true;
  /** Quantos vértices desenhar quando não há índice. */
  uint32_t vertexCount = 0;
  /**
   * Bytes entre vértices. NÃO é sempre 12: o cook do export regrava os GLB com
   * os atributos interleaved, e aí o passo é o do bloco inteiro.
   */
  uint32_t vertexStride = 12;
  /** Bytes do início do bloco até a posição, quando interleaved. */
  uint64_t vertexOffset = 0;
  /**
   * `false` quando a `position` NÃO é `float32x3` (ADR-0692). O pipeline do passe
   * de sombra só lê esse formato, então a entrada não é guardada: o id fica
   * marcado e o gate recusa com `posicao-nao-float32x3`, não `geometria-ausente`.
   */
  bool positionIsFloat32x3 = true;
};

/**
 * Tabela id → buffers, com uma referência a cada buffer guardado.
 *
 * Testável sem GPU — os handles são opacos e o `AddRef`/`Release` entra por
 * {@link BufferRefOps}, então o harness exercita a política (registrar,
 * encontrar, substituir, remover, contar referências) com ponteiros falsos.
 */
class GeometryRegistry {
 public:
  /**
   * Sem destrutor que solta: a instância do processo morre na saída, depois do
   * device, e um `Release` ali correria contra o wgpu já desmontado. Quem quer
   * soltar chama {@link clear}.
   */
  explicit GeometryRegistry(const BufferRefOps& ops) : ops_(ops) {}
  GeometryRegistry(const GeometryRegistry&) = delete;
  GeometryRegistry& operator=(const GeometryRegistry&) = delete;

  /**
   * Registra (ou atualiza) uma geometria. Devolve `false` quando a entrada é
   * inútil — sem buffer de vértice ou sem nada para desenhar —, porque uma
   * geometria que não desenha nada no caminho nativo é um objeto que sumiria da
   * imagem em silêncio, e é melhor recusar e deixá-lo com o `three`.
   *
   * Aceita: `AddRef` dos buffers novos e `Release` dos que a entrada antiga do
   * mesmo id guardava. Recusa: a entrada antiga do id também sai (a geometria
   * mudou e o que estava registrado não a representa mais). Com
   * `positionIsFloat32x3 == false` o id fica marcado em {@link positionRefused}.
   */
  bool set(uint32_t id, const GeometryEntry& entry);

  /** Devolve a entrada, ou `nullptr` se o id não está registrado. */
  const GeometryEntry* find(uint32_t id) const;

  /** O id foi registrado com `position` fora de `float32x3` (e não depois com uma válida)? */
  bool positionRefused(uint32_t id) const { return positionRefused_.count(id) != 0; }

  /** Esquece a geometria e solta a referência dos buffers dela. */
  void erase(uint32_t id);

  /** Quantas geometrias estão registradas. */
  size_t size() const { return entries_.size(); }

  /** Esquece tudo (troca de cena), soltando a referência de cada buffer. */
  void clear();

 private:
  void releaseEntry(const GeometryEntry& entry) const;

  BufferRefOps ops_;
  std::unordered_map<uint32_t, GeometryEntry> entries_;
  /** Ids recusados por formato de `position` (ver {@link GeometryEntry::positionIsFloat32x3}). */
  std::unordered_set<uint32_t> positionRefused_;
};

}  // namespace render
