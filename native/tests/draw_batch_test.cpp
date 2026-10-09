// Testes do lote de desenhos diretos (SPEC-0333, b.2): armazém de receitas e
// replay com eliminação de estado redundante.
#include "../src/render/draw_batch.h"

#include <string>
#include <vector>

#include "harness.h"

namespace {

using render::DrawCommand;
using render::DrawRecipe;
using render::IndexFormat;
using render::RecipeStore;

/** Grava o que o replay emitiria, como texto (fácil de comparar). */
class Gravador final : public render::DrawEmitter {
 public:
  std::vector<std::string> ops;
  void setPipeline(void* p) override { ops.push_back("P" + id(p)); }
  void setBindGroup(uint32_t i, void* g) override { ops.push_back("G" + std::to_string(i) + id(g)); }
  void setVertexBuffer(uint32_t s, void* b) override { ops.push_back("V" + std::to_string(s) + id(b)); }
  void setIndexBuffer(void* b, IndexFormat f) override {
    ops.push_back("I" + id(b) + (f == IndexFormat::kUint32 ? "u32" : "u16"));
  }
  void draw(uint32_t c, uint32_t n, uint32_t f) override { ops.push_back("d" + num(c, n, f)); }
  void drawIndexed(uint32_t c, uint32_t n, uint32_t f) override { ops.push_back("D" + num(c, n, f)); }

 private:
  static std::string id(void* p) { return std::to_string(reinterpret_cast<uintptr_t>(p)); }
  static std::string num(uint32_t c, uint32_t n, uint32_t f) {
    return std::to_string(c) + "x" + std::to_string(n) + "@" + std::to_string(f);
  }
};

void* h(uintptr_t v) { return reinterpret_cast<void*>(v); }

DrawRecipe receita(uintptr_t pipeline, uintptr_t grupoDoObjeto, uintptr_t vb, uintptr_t index) {
  DrawRecipe r;
  r.pipeline = h(pipeline);
  r.groupCount = 2;
  r.groups[0] = h(100);  // grupo compartilhado (câmera)
  r.groups[1] = h(grupoDoObjeto);
  r.vertexBufferCount = 1;
  r.vertexBuffers[0] = h(vb);
  if (index != 0) {
    r.index = h(index);
    r.indexFormat = IndexFormat::kUint16;
  }
  return r;
}

}  // namespace

namespace tests {

void testDrawBatchPrimeiroSetaTudoDepoisSoOQueMuda() {
  RecipeStore store;
  const int32_t a = store.add(receita(1, 10, 20, 30));
  const int32_t b = store.add(receita(1, 11, 21, 30));  // mesmo pipeline e índice
  const DrawCommand cmds[] = {{a, 36, 1, 0}, {b, 12, 1, 6}};
  Gravador g;
  CHECK(render::replay(store, cmds, 2, g) == 2);
  const std::vector<std::string> esperado = {
      "P1", "G0100", "G110", "I30u16", "V020", "D36x1@0",
      "G111", "V021", "D12x1@6",
  };
  CHECK(g.ops == esperado);
}

void testDrawBatchSemIndiceUsaDraw() {
  RecipeStore store;
  const int32_t a = store.add(receita(2, 10, 20, 0));
  const DrawCommand cmd{a, 9, 4, 3};
  Gravador g;
  CHECK(render::replay(store, &cmd, 1, g) == 1);
  CHECK(g.ops.back() == "d9x4@3");
}

void testDrawBatchReceitaRemovidaEPuladaESlotReusado() {
  RecipeStore store;
  const int32_t a = store.add(receita(1, 10, 20, 30));
  DrawRecipe removida;
  CHECK(store.remove(a, &removida));
  CHECK(removida.pipeline == h(1));
  CHECK(!store.remove(a, nullptr));
  const DrawCommand cmd{a, 3, 1, 0};
  Gravador g;
  CHECK(render::replay(store, &cmd, 1, g) == 0);
  CHECK(g.ops.empty());
  const int32_t b = store.add(receita(5, 10, 20, 30));
  CHECK(b == a);  // slot reaproveitado
  CHECK(store.liveCount() == 1);
}

void testDrawBatchEstadoDesconhecidoNaEntrada() {
  // Duas chamadas seguidas: a segunda não pode supor o estado da primeira
  // (o `three` desenhou no meio e mexeu no encoder).
  RecipeStore store;
  const int32_t a = store.add(receita(1, 10, 20, 30));
  const DrawCommand cmd{a, 3, 1, 0};
  Gravador g1, g2;
  render::replay(store, &cmd, 1, g1);
  render::replay(store, &cmd, 1, g2);
  CHECK(g1.ops == g2.ops);
}

}  // namespace tests
