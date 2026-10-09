// Ver draw_batch_shim.h (SPEC-0333, b.2).
#include "draw_batch_shim.h"

#include <webgpu/wgpu.h>

#include <cstdint>

#include "../napi/napi_util.h"
#include "../render/draw_batch.h"
#include "../webgpu/napi_stats.h"

namespace shims {
namespace {

/** Argumentos de `record`: pipeline, grupos, vertex buffers, índice, índice 32 bits. */
constexpr size_t kArgsRecord = 5;
/** Argumentos de `flush`: pass encoder, comandos, quantos. */
constexpr size_t kArgsFlush = 3;
/** Devolvido por `flush` quando os argumentos não servem. */
constexpr double kFlushBadArgs = -1;

render::RecipeStore& store() {
  static render::RecipeStore instance;
  return instance;
}

/** Emissão no `GPURenderPassEncoder` real, com os mesmos contadores do caminho JS. */
class WgpuEmitter final : public render::DrawEmitter {
 public:
  explicit WgpuEmitter(WGPURenderPassEncoder pass) : pass_(pass) {}
  void setPipeline(void* p) override {
    webgpu::bumpSetPipeline();
    wgpuRenderPassEncoderSetPipeline(pass_, static_cast<WGPURenderPipeline>(p));
  }
  void setBindGroup(uint32_t i, void* g) override {
    webgpu::bumpSetBindGroup();
    wgpuRenderPassEncoderSetBindGroup(pass_, i, static_cast<WGPUBindGroup>(g), 0, nullptr);
  }
  void setVertexBuffer(uint32_t slot, void* b) override {
    webgpu::bumpSetVertexBuffer();
    wgpuRenderPassEncoderSetVertexBuffer(pass_, slot, static_cast<WGPUBuffer>(b), 0, WGPU_WHOLE_SIZE);
  }
  void setIndexBuffer(void* b, render::IndexFormat f) override {
    webgpu::bumpSetIndexBuffer();
    const WGPUIndexFormat formato =
        f == render::IndexFormat::kUint32 ? WGPUIndexFormat_Uint32 : WGPUIndexFormat_Uint16;
    wgpuRenderPassEncoderSetIndexBuffer(pass_, static_cast<WGPUBuffer>(b), formato, 0, WGPU_WHOLE_SIZE);
  }
  void draw(uint32_t count, uint32_t instances, uint32_t first) override {
    webgpu::bumpDraw();
    wgpuRenderPassEncoderDraw(pass_, count, instances, first, 0);
  }
  void drawIndexed(uint32_t count, uint32_t instances, uint32_t first) override {
    webgpu::bumpDrawIndexed();
    wgpuRenderPassEncoderDrawIndexed(pass_, count, instances, first, 0, 0);
  }

 private:
  WGPURenderPassEncoder pass_;
};

void addRef(const render::DrawRecipe& r) {
  wgpuRenderPipelineAddRef(static_cast<WGPURenderPipeline>(r.pipeline));
  for (uint32_t i = 0; i < r.groupCount; i++) wgpuBindGroupAddRef(static_cast<WGPUBindGroup>(r.groups[i]));
  for (uint32_t i = 0; i < r.vertexBufferCount; i++) wgpuBufferAddRef(static_cast<WGPUBuffer>(r.vertexBuffers[i]));
  if (r.index != nullptr) wgpuBufferAddRef(static_cast<WGPUBuffer>(r.index));
}

void releaseRefs(const render::DrawRecipe& r) {
  wgpuRenderPipelineRelease(static_cast<WGPURenderPipeline>(r.pipeline));
  for (uint32_t i = 0; i < r.groupCount; i++) wgpuBindGroupRelease(static_cast<WGPUBindGroup>(r.groups[i]));
  for (uint32_t i = 0; i < r.vertexBufferCount; i++) wgpuBufferRelease(static_cast<WGPUBuffer>(r.vertexBuffers[i]));
  if (r.index != nullptr) wgpuBufferRelease(static_cast<WGPUBuffer>(r.index));
}

/** Lê um array JS de handles; `false` se algum não for handle ou passar do limite. */
bool lerHandles(napi_env env, napi_value array, size_t limite, void** out, uint8_t* count) {
  uint32_t n = 0;
  if (napi_get_array_length(env, array, &n) != napi_ok || n > limite) return false;
  for (uint32_t i = 0; i < n; i++) {
    napi_value item = nullptr;
    napi_get_element(env, array, i, &item);
    out[i] = njs::unwrapValue(env, item);
    if (out[i] == nullptr) return false;
  }
  *count = static_cast<uint8_t>(n);
  return true;
}

napi_value number(napi_env env, double v) {
  napi_value out;
  napi_create_double(env, v, &out);
  return out;
}

/** `record(pipeline, grupos[], vertexBuffers[], indexBuffer|null, indice32)` → id ou -1. */
napi_value jsRecord(napi_env env, napi_callback_info info) {
  size_t argc = kArgsRecord;
  napi_value args[kArgsRecord];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  if (argc < kArgsRecord) return number(env, render::kNoRecipe);
  render::DrawRecipe r;
  r.pipeline = njs::unwrapValue(env, args[0]);
  if (r.pipeline == nullptr ||
      !lerHandles(env, args[1], render::kMaxBindGroups, r.groups.data(), &r.groupCount) ||
      !lerHandles(env, args[2], render::kMaxVertexBuffers, r.vertexBuffers.data(), &r.vertexBufferCount)) {
    return number(env, render::kNoRecipe);
  }
  napi_valuetype tipo;
  napi_typeof(env, args[3], &tipo);
  if (tipo != napi_null && tipo != napi_undefined) {
    r.index = njs::unwrapValue(env, args[3]);
    if (r.index == nullptr) return number(env, render::kNoRecipe);
    bool u32 = false;
    napi_get_value_bool(env, args[4], &u32);
    r.indexFormat = u32 ? render::IndexFormat::kUint32 : render::IndexFormat::kUint16;
  }
  addRef(r);
  return number(env, store().add(r));
}

/** `release(id)` — a receita saiu (render object regravado ou descartado). */
napi_value jsRelease(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  int32_t id = render::kNoRecipe;
  if (argc >= 1) napi_get_value_int32(env, args[0], &id);
  render::DrawRecipe removida;
  if (store().remove(id, &removida)) releaseRefs(removida);
  return njs::undefined(env);
}

/** `flush(passEncoder, comandos: Int32Array, quantos)` → desenhos emitidos, ou -1. */
napi_value jsFlush(napi_env env, napi_callback_info info) {
  webgpu::NapiTimer cronometro;  // conta como ponte, igual ao caminho JS (SPEC-0225)
  (void)cronometro;
  size_t argc = kArgsFlush;
  napi_value args[kArgsFlush];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  if (argc < kArgsFlush) return number(env, kFlushBadArgs);
  auto* pass = static_cast<WGPURenderPassEncoder>(njs::unwrapValue(env, args[0]));
  napi_typedarray_type tipo;
  void* dados = nullptr;
  size_t tamanho = 0;
  napi_value buffer;
  size_t offset = 0;
  uint32_t quantos = 0;
  if (pass == nullptr ||
      napi_get_typedarray_info(env, args[1], &tipo, &tamanho, &dados, &buffer, &offset) != napi_ok ||
      tipo != napi_int32_array || napi_get_value_uint32(env, args[2], &quantos) != napi_ok ||
      static_cast<size_t>(quantos) * render::kCommandInts > tamanho) {
    return number(env, kFlushBadArgs);
  }
  static_assert(sizeof(render::DrawCommand) == sizeof(int32_t) * render::kCommandInts,
                "DrawCommand tem de ter o layout do Int32Array do JS");
  WgpuEmitter emissor(pass);
  const auto* comandos = static_cast<const render::DrawCommand*>(dados);
  return number(env, render::replay(store(), comandos, quantos, emissor));
}

}  // namespace

void registerDrawBatch(napi_env env) {
  napi_value global = nullptr;
  napi_get_global(env, &global);
  napi_value api = njs::makeObject(env);
  njs::setMethod(env, api, "record", jsRecord);
  njs::setMethod(env, api, "release", jsRelease);
  njs::setMethod(env, api, "flush", jsFlush);
  napi_set_named_property(env, global, "__cortexDrawBatch", api);
}

}  // namespace shims
