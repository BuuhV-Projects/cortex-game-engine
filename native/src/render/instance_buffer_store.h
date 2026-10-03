// Matrizes de instância dos `InstancedMesh` casters, em buffers do HOST
// (SPEC-0289).
//
// Diferente da geometria, não dá para emprestar o buffer do `three`: ele sobe
// `instanceMatrix` como uniform buffer até o limite do dispositivo e como
// atributo intercalado acima (`InstanceNode._createInstanceMatrixNode`). Um
// buffer cujo tipo depende do tamanho do lote não é contrato. Por isso o JS
// manda o `instanceMatrix.array` quando ele muda (`version`/`count`) e este
// store guarda uma cópia num `GPUBuffer` próprio, usado como atributo POR
// INSTÂNCIA no passe de sombra.
#pragma once

#include <cstdint>
#include <unordered_map>

#include <webgpu/webgpu.h>

struct HostGpu;

namespace render {

/** Floats de uma matriz de instância (mat4, coluna-maior como o `three`). */
constexpr uint32_t kInstanceMatrixFloats = 16;
/** Bytes de uma matriz de instância — o passo do atributo por instância. */
constexpr uint64_t kInstanceStrideBytes = kInstanceMatrixFloats * sizeof(float);

/** As instâncias de um nó, prontas para o passe. */
struct InstanceSet {
  WGPUBuffer buffer = nullptr;
  /** Instâncias que cabem no buffer (cresce, nunca encolhe). */
  uint32_t capacity = 0;
  /** Instâncias a desenhar (`InstancedMesh.count`). Zero = não desenha. */
  uint32_t count = 0;
};

/** Nó do espelho → instâncias. Dono dos buffers que cria. */
class InstanceBufferStore {
 public:
  /**
   * Copia `count` matrizes de `matrices` para o buffer do nó, criando ou
   * crescendo o buffer quando falta capacidade. Devolve `false` se a GPU
   * recusar o buffer — e aí o nó fica SEM instâncias, o que faz o gate
   * recusar o frame em vez de desenhar matriz velha.
   */
  bool upload(HostGpu* gpu, int32_t node, const float* matrices, uint32_t count);

  /** As instâncias do nó, ou `nullptr` se o host não as tem. */
  const InstanceSet* find(int32_t node) const;

  /** Esquece o nó e libera o buffer (o nó saiu do espelho). */
  void erase(int32_t node);

  /**
   * Libera os nós para os quais `removed(node)` é verdadeiro. Roda depois de
   * uma remoção no espelho: o slot pode ser reaproveitado por outro nó, que
   * não pode herdar as instâncias do anterior.
   */
  template <typename Removed>
  void eraseIf(Removed removed) {
    for (auto it = sets_.begin(); it != sets_.end();) {
      if (removed(it->first)) {
        release(it->second);
        it = sets_.erase(it);
      } else {
        ++it;
      }
    }
  }

  /** Esquece tudo (espelho reconstruído). */
  void clear();

 private:
  static void release(InstanceSet& set);
  std::unordered_map<int32_t, InstanceSet> sets_;
};

}  // namespace render
