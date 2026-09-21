// Ponte do passe nativo (SPEC-0241, passo 3).
//
// O JS manda UM array plano com todos os itens do frame, em vez de uma chamada
// por objeto: a ponte custa ~15 us por travessia (SPEC-0225), e pagar isso por
// objeto devolveria o custo que esta migracao existe para tirar.
#include "native_pass_shim.h"

#include "../napi/napi_util.h"
#include "../render/native_pass.h"

#include <cstdint>
#include <cstring>
#include <vector>

namespace shims {
namespace {

/** Floats por item no array plano: id + matriz de mundo + cor. */
constexpr uint32_t kFloatsPorItem = 1 + 16 + 4;
/** Floats de uma matriz 4x4. */
constexpr uint32_t kMatrixFloats = 16;
constexpr uint32_t kCanaisCor = 4;
/** Args: alvoCor, alvoProfundidade, viewProfundidade, viewProjection, itens. */
constexpr size_t kArgsDraw = 5;

HostGpu* g_gpu = nullptr;

/** Le um Float32Array; devolve nullptr se nao for um. */
const float* floatsDe(napi_env env, napi_value valor, size_t* tamanhoOut) {
  bool ehTypedArray = false;
  napi_is_typedarray(env, valor, &ehTypedArray);
  if (!ehTypedArray) return nullptr;
  napi_typedarray_type tipo;
  size_t tamanho = 0;
  void* dados = nullptr;
  napi_get_typedarray_info(env, valor, &tipo, &tamanho, &dados, nullptr, nullptr);
  if (tipo != napi_float32_array || !dados) return nullptr;
  if (tamanhoOut) *tamanhoOut = tamanho;
  return static_cast<const float*>(dados);
}

WGPUTexture texturaDe(napi_env env, napi_value valor) {
  napi_valuetype tipo = napi_undefined;
  napi_typeof(env, valor, &tipo);
  if (tipo == napi_null || tipo == napi_undefined) return nullptr;
  return static_cast<WGPUTexture>(njs::unwrapValue(env, valor));
}

/** `draw(alvoCor, alvoProf, viewProf, viewProjection, itens)` -> desenhados */
napi_value jsDraw(napi_env env, napi_callback_info info) {
  size_t argc = kArgsDraw;
  napi_value args[kArgsDraw];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  napi_value saida = nullptr;
  if (argc < kArgsDraw) {
    njs::throwError(env, "draw: faltam argumentos");
    return njs::undefined(env);
  }

  size_t floatsDaCamera = 0;
  const float* viewProjection = floatsDe(env, args[3], &floatsDaCamera);
  size_t floatsDosItens = 0;
  const float* itens = floatsDe(env, args[4], &floatsDosItens);
  if (!viewProjection || floatsDaCamera < kMatrixFloats || !itens) {
    napi_create_double(env, 0, &saida);
    return saida;
  }

  const uint32_t total = static_cast<uint32_t>(floatsDosItens / kFloatsPorItem);
  std::vector<render::NativeDrawItem> lista;
  lista.reserve(total);
  for (uint32_t i = 0; i < total; ++i) {
    const float* base = itens + static_cast<size_t>(i) * kFloatsPorItem;
    render::NativeDrawItem item;
    item.geometryId = static_cast<uint32_t>(base[0]);
    std::memcpy(item.model, base + 1, sizeof(float) * kMatrixFloats);
    std::memcpy(item.color, base + 1 + kMatrixFloats, sizeof(float) * kCanaisCor);
    lista.push_back(item);
  }

  napi_valuetype tipoView = napi_undefined;
  napi_typeof(env, args[2], &tipoView);
  WGPUTextureView viewProfundidade =
      (tipoView == napi_null || tipoView == napi_undefined)
          ? nullptr
          : static_cast<WGPUTextureView>(njs::unwrapValue(env, args[2]));

  const uint32_t desenhados = render::drawNativeItems(
      g_gpu, texturaDe(env, args[0]), texturaDe(env, args[1]), viewProfundidade,
      viewProjection, lista.data(), static_cast<uint32_t>(lista.size()));
  napi_create_double(env, desenhados, &saida);
  return saida;
}

}  // namespace

void registerNativePass(napi_env env, HostGpu* gpu) {
  g_gpu = gpu;
  napi_value api = nullptr;
  napi_create_object(env, &api);
  njs::setMethod(env, api, "draw", jsDraw);
  napi_value global = nullptr;
  napi_get_global(env, &global);
  napi_set_named_property(env, global, "__cortexNativePass", api);
}

}  // namespace shims
