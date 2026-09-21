// Ponte do registro de geometria (SPEC-0241, passo 2).
//
// O JS manda os handles de buffer que o `three` JA criou; o C++ so os guarda
// numa tabela por id, para conseguir gravar setVertexBuffer/setIndexBuffer sem
// atravessar a ponte por frame. Nada aqui e dono de buffer nenhum.
#include "geometry_registry_shim.h"

#include "../napi/napi_util.h"
#include "../render/geometry_registry.h"

namespace shims {
namespace {

/** Args: id, vertice, indice, indices, vertices, indice32bits, passo, deslocamento. */
constexpr size_t kArgsRegister = 8;

WGPUBuffer bufferDoArgumento(napi_env env, napi_value valor) {
  napi_valuetype tipo = napi_undefined;
  napi_typeof(env, valor, &tipo);
  // `null`/`undefined` e "nao tem indice" — caso legitimo de malha nao indexada.
  if (tipo == napi_null || tipo == napi_undefined) return nullptr;
  return static_cast<WGPUBuffer>(njs::unwrapValue(env, valor));
}

uint32_t inteiroDoArgumento(napi_env env, napi_value valor) {
  double bruto = 0.0;
  napi_get_value_double(env, valor, &bruto);
  return bruto > 0.0 ? static_cast<uint32_t>(bruto) : 0u;
}

/** `register(id, vertexBuffer, indexBuffer, indexCount, vertexCount, indexIs32Bit)` */
napi_value jsRegister(napi_env env, napi_callback_info info) {
  size_t argc = kArgsRegister;
  napi_value args[kArgsRegister];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  if (argc < kArgsRegister) {
    njs::throwError(env, "register: faltam argumentos");
    return njs::undefined(env);
  }

  render::GeometryEntry entrada;
  entrada.vertexBuffer = bufferDoArgumento(env, args[1]);
  entrada.indexBuffer = bufferDoArgumento(env, args[2]);
  entrada.indexCount = inteiroDoArgumento(env, args[3]);
  entrada.vertexCount = inteiroDoArgumento(env, args[4]);
  bool indice32 = true;
  napi_get_value_bool(env, args[5], &indice32);
  entrada.indexIs32Bit = indice32;
  entrada.vertexStride = inteiroDoArgumento(env, args[6]);
  entrada.vertexOffset = inteiroDoArgumento(env, args[7]);

  const bool ok = geometryRegistry().set(inteiroDoArgumento(env, args[0]), entrada);
  napi_value saida = nullptr;
  napi_get_boolean(env, ok, &saida);
  return saida;
}

/** `unregister(id)` — esquece a geometria, sem liberar nada. */
napi_value jsUnregister(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  if (argc >= 1) geometryRegistry().erase(inteiroDoArgumento(env, args[0]));
  return njs::undefined(env);
}

/** `size()` — quantas geometrias estao registradas (para o trace). */
napi_value jsSize(napi_env env, napi_callback_info) {
  napi_value saida = nullptr;
  napi_create_double(env, static_cast<double>(geometryRegistry().size()), &saida);
  return saida;
}

/** `clear()` — troca de cena. */
napi_value jsClear(napi_env env, napi_callback_info) {
  geometryRegistry().clear();
  return njs::undefined(env);
}

}  // namespace

render::GeometryRegistry& geometryRegistry() {
  // Estado do processo, como o espelho de cena: o host tem um runtime so, e
  // quem desenha precisa consultar esta tabela fora do escopo do callback.
  static render::GeometryRegistry instancia;
  return instancia;
}

void registerGeometryRegistry(napi_env env) {
  napi_value api = nullptr;
  napi_create_object(env, &api);
  njs::setMethod(env, api, "register", jsRegister);
  njs::setMethod(env, api, "unregister", jsUnregister);
  njs::setMethod(env, api, "size", jsSize);
  njs::setMethod(env, api, "clear", jsClear);
  napi_value global = nullptr;
  napi_get_global(env, &global);
  napi_set_named_property(env, global, "__cortexGeometryRegistry", api);
}

}  // namespace shims
