// Lote de desenhos diretos (SPEC-0333, passo b.2 do ADR-0330).
//
// O desenho direto da b.1 (`CleanDrawFastPath.ts`) já pula a verificação do
// `three` para os render objects limpos, mas cada um ainda passa pelo
// `backend.draw` em JS: ~9 µs de estado em JS e 3–8 travessias de ponte
// (setPipeline/setBindGroup/setVertexBuffer/drawIndexed). Aqui a receita de
// cada render object — os MESMOS handles que o `three` usou — é gravada uma
// vez, e uma sequência contígua de desenhos diretos atravessa a ponte numa
// chamada só.
//
// Esta parte é PURA (sem wgpu): armazém de receitas e replay com eliminação
// de estado redundante, atrás de uma interface de emissão — é o que o teste
// exercita. A ponte (`shims/draw_batch_shim.*`) liga a emissão ao wgpu.
#pragma once

#include <array>
#include <cstdint>
#include <vector>

namespace render {

/** Grupos de bind por receita (o `three` usa 2–4; o limite do WebGPU é 4). */
constexpr int kMaxBindGroups = 4;
/** Vertex buffers por receita (posição, normal, uv, cor, tangente...). */
constexpr int kMaxVertexBuffers = 8;
/** Id de receita inválido (devolvido quando não cabe/recusa). */
constexpr int32_t kNoRecipe = -1;

/** Formato do índice da receita. */
enum class IndexFormat : uint8_t { kNone = 0, kUint16 = 1, kUint32 = 2 };

/** Os handles de um desenho, opacos para esta parte (o shim sabe o tipo). */
struct DrawRecipe {
  void* pipeline = nullptr;
  std::array<void*, kMaxBindGroups> groups{};
  uint8_t groupCount = 0;
  std::array<void*, kMaxVertexBuffers> vertexBuffers{};
  uint8_t vertexBufferCount = 0;
  void* index = nullptr;
  IndexFormat indexFormat = IndexFormat::kNone;
};

/** Um desenho da sequência: a receita e os parâmetros do `drawParams` do three. */
struct DrawCommand {
  int32_t recipe = kNoRecipe;
  uint32_t count = 0;
  uint32_t instanceCount = 1;
  uint32_t first = 0;
};

/** Inteiros por comando no buffer que o JS escreve (ver {@link DrawCommand}). */
constexpr int kCommandInts = 4;

/** Onde o replay emite. O shim implementa com o wgpu; o teste, com um gravador. */
class DrawEmitter {
 public:
  virtual ~DrawEmitter() = default;
  virtual void setPipeline(void* pipeline) = 0;
  virtual void setBindGroup(uint32_t index, void* group) = 0;
  virtual void setVertexBuffer(uint32_t slot, void* buffer) = 0;
  virtual void setIndexBuffer(void* buffer, IndexFormat format) = 0;
  virtual void draw(uint32_t count, uint32_t instances, uint32_t first) = 0;
  virtual void drawIndexed(uint32_t count, uint32_t instances, uint32_t first) = 0;
};

/**
 * Receitas vivas, por id estável. O slot de uma receita removida volta a ser
 * usado: o JS regrava a cada vez que o `three` refaz o render object.
 */
class RecipeStore {
 public:
  int32_t add(const DrawRecipe& recipe);
  /** Tira a receita; devolve `false` se o id não está vivo. */
  bool remove(int32_t id, DrawRecipe* removed);
  const DrawRecipe* find(int32_t id) const;
  size_t liveCount() const { return live_; }

 private:
  std::vector<DrawRecipe> recipes_;
  std::vector<uint8_t> alive_;
  std::vector<int32_t> free_;
  size_t live_ = 0;
};

/**
 * Emite a sequência. O estado do encoder é DESCONHECIDO na entrada (o `three`
 * pode ter mexido nele), então o primeiro desenho seta tudo; dali em diante só
 * o que muda entre receitas consecutivas.
 *
 * @return quantos desenhos saíram (comando com receita morta é pulado).
 */
uint32_t replay(const RecipeStore& store, const DrawCommand* commands, size_t count, DrawEmitter& emitter);

}  // namespace render
