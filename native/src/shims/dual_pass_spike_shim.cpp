// Ponte do spike do M5 (SPEC-0241, passo 0) — TEMPORÁRIA.
//
// Expõe `__cortexDualPassSpike` para o JS conseguir, de dentro do frame real do
// jogo, mandar o C++ desenhar no MESMO alvo que o `three` usa e depois ler
// pixels de volta. Sem isto o spike teria de recriar a cena, e aí não mediria a
// convivência, que é justamente a pergunta.
#include "dual_pass_spike_shim.h"

#include "../napi/napi_util.h"
#include "../core/host_gpu.h"
#include "../webgpu/dual_pass_spike.h"

#include <webgpu/webgpu.h>

namespace shims {
namespace {

/** O host tem um device so; guardado no registro para os callbacks usarem. */
HostGpu* g_gpu = nullptr;

constexpr uint32_t kCanaisRgba = 4;

WGPUTexture texturaDoArgumento(napi_env env, napi_value valor) {
  return static_cast<WGPUTexture>(njs::unwrapValue(env, valor));
}

/** `drawMarker(cor, profundidade, profundidadeNdc, limpar)` */
napi_value jsDrawMarker(napi_env env, napi_callback_info info) {
  size_t argc = 4;
  napi_value args[4];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  if (argc < 4) {
    njs::throwError(env, "drawMarker: faltam argumentos");
    return njs::undefined(env);
  }
  WGPUTexture cor = texturaDoArgumento(env, args[0]);
  WGPUTexture profundidade = texturaDoArgumento(env, args[1]);
  double ndc = 0.0;
  napi_get_value_double(env, args[2], &ndc);
  bool limpar = false;
  napi_get_value_bool(env, args[3], &limpar);

  const bool ok = webgpu::spikeDrawMarker(g_gpu, cor, profundidade,
                                          static_cast<float>(ndc), limpar);
  napi_value saida = nullptr;
  napi_get_boolean(env, ok, &saida);
  return saida;
}

/** `readPixel(cor, x, y)` → `[r, g, b, a]` ou `null` se a leitura falhou. */
napi_value jsReadPixel(napi_env env, napi_callback_info info) {
  size_t argc = 3;
  napi_value args[3];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  if (argc < 3) {
    njs::throwError(env, "readPixel: faltam argumentos");
    return njs::undefined(env);
  }
  WGPUTexture cor = texturaDoArgumento(env, args[0]);
  double x = 0.0;
  double y = 0.0;
  napi_get_value_double(env, args[1], &x);
  napi_get_value_double(env, args[2], &y);

  float canais[kCanaisRgba] = {0.0f, 0.0f, 0.0f, 0.0f};
  const bool ok = webgpu::spikeReadPixel(g_gpu, cor,
                                         static_cast<uint32_t>(x),
                                         static_cast<uint32_t>(y), canais);
  if (!ok) {
    napi_value nulo = nullptr;
    napi_get_null(env, &nulo);
    return nulo;
  }
  napi_value lista = nullptr;
  napi_create_array_with_length(env, kCanaisRgba, &lista);
  for (uint32_t i = 0; i < kCanaisRgba; ++i) {
    napi_value v = nullptr;
    napi_create_double(env, canais[i], &v);
    napi_set_element(env, lista, i, v);
  }
  return lista;
}

}  // namespace

void registerDualPassSpike(napi_env env, HostGpu* gpu) {
  g_gpu = gpu;
  napi_value api = nullptr;
  napi_create_object(env, &api);
  njs::setMethod(env, api, "drawMarker", jsDrawMarker);
  njs::setMethod(env, api, "readPixel", jsReadPixel);
  napi_value global = nullptr;
  napi_get_global(env, &global);
  napi_set_named_property(env, global, "__cortexDualPassSpike", api);
}

}  // namespace shims
