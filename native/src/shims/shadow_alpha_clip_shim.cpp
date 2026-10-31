// Ver shadow_alpha_clip_shim.h (SPEC-0642).
//
// O JS chama `set` só quando algo do recorte muda (textura, UV, alphaTest, matriz),
// não por quadro — ver `src/render/ShadowAlphaClipSync.ts`.
#include "shadow_alpha_clip_shim.h"

#include "../napi/napi_util.h"
#include "../render/alpha_clip_store.h"
#include "../scene/scene_mirror.h"
#include "scene_mirror_shim.h"

namespace shims {
namespace {

/** Args de `set` (ver o header). */
constexpr size_t kArgsSet = 9;
constexpr size_t kArgNode = 0;
constexpr size_t kArgTexture = 1;
constexpr size_t kArgUvBuffer = 2;
constexpr size_t kArgUvStride = 3;
constexpr size_t kArgUvOffset = 4;
constexpr size_t kArgAlphaTest = 5;
constexpr size_t kArgWrapS = 6;
constexpr size_t kArgWrapT = 7;
constexpr size_t kArgUvMatrix = 8;

HostGpu* g_gpu = nullptr;

double numero(napi_env env, napi_value valor) {
  double bruto = 0.0;
  napi_get_value_double(env, valor, &bruto);
  return bruto;
}

/** Handle desembrulhado, ou `nullptr` para `null`/`undefined`. */
void* handle(napi_env env, napi_value valor) {
  napi_valuetype tipo = napi_undefined;
  napi_typeof(env, valor, &tipo);
  if (tipo != napi_object) return nullptr;
  return njs::unwrapValue(env, valor);
}

/** O nó existe no espelho e não é lápide? (o slot de lápide não pode ganhar recorte) */
bool noVivo(int32_t node) {
  const scene::SceneMirror* espelho = builtSceneMirror();
  return espelho != nullptr && node >= 0 && static_cast<size_t>(node) < espelho->size() &&
         !espelho->removed(static_cast<scene::NodeIndex>(node));
}

napi_value jsSet(napi_env env, napi_callback_info info) {
  size_t argc = kArgsSet;
  napi_value args[kArgsSet];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  bool ok = false;
  if (argc >= kArgsSet) {
    const auto node = static_cast<int32_t>(numero(env, args[kArgNode]));
    render::AlphaClipSource fonte;
    fonte.texture = static_cast<WGPUTexture>(handle(env, args[kArgTexture]));
    fonte.uvBuffer = static_cast<WGPUBuffer>(handle(env, args[kArgUvBuffer]));
    const double passo = numero(env, args[kArgUvStride]);
    const double deslocamento = numero(env, args[kArgUvOffset]);
    fonte.uvStride = passo > 0.0 ? static_cast<uint32_t>(passo) : 0u;
    fonte.uvOffset = deslocamento > 0.0 ? static_cast<uint64_t>(deslocamento) : 0u;
    fonte.alphaTest = static_cast<float>(numero(env, args[kArgAlphaTest]));

    napi_typedarray_type tipo;
    void* dados = nullptr;
    size_t comprimento = 0;
    napi_value buffer;
    size_t offset = 0;
    const bool matrizOk =
        napi_get_typedarray_info(env, args[kArgUvMatrix], &tipo, &comprimento, &dados, &buffer,
                                 &offset) == napi_ok &&
        tipo == napi_float32_array && dados != nullptr &&
        comprimento >= render::kUvTransformFloats;
    if (matrizOk && noVivo(node) &&
        render::alphaClipWrapFromThree(numero(env, args[kArgWrapS]), &fonte.wrapS) &&
        render::alphaClipWrapFromThree(numero(env, args[kArgWrapT]), &fonte.wrapT)) {
      const auto* matriz = static_cast<const float*>(dados);
      for (uint32_t i = 0; i < render::kUvTransformFloats; ++i) fonte.uvTransform[i] = matriz[i];
      ok = render::alphaClipStore().set(g_gpu, node, fonte);
    } else {
      // Entrada inválida: o nó fica sem recorte, e o gate recusa — nunca o recorte velho.
      render::alphaClipStore().erase(node);
    }
  }
  napi_value saida = nullptr;
  napi_get_boolean(env, ok, &saida);
  return saida;
}

napi_value jsErase(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  if (argc >= 1) render::alphaClipStore().erase(static_cast<int32_t>(numero(env, args[0])));
  return njs::undefined(env);
}

}  // namespace

void registerShadowAlphaClip(napi_env env, HostGpu* gpu) {
  g_gpu = gpu;
  napi_value api = nullptr;
  napi_create_object(env, &api);
  njs::setMethod(env, api, "set", jsSet);
  njs::setMethod(env, api, "erase", jsErase);
  napi_value global = nullptr;
  napi_get_global(env, &global);
  napi_set_named_property(env, global, "__cortexShadowAlphaClip", api);
}

}  // namespace shims
