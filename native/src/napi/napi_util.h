// Helpers Node-API compartilhados — leitura de propriedades, wrap/unwrap de
// handles nativos e chamadas JS com log de exceção. Nenhuma dependência de
// WebGPU/SDL: é a camada utilitária de TODOS os bindings.
#pragma once

#include <hermes/hermes_api.h>

#include <string>

namespace njs {

napi_value undefined(napi_env env);
void throwError(napi_env env, const char* message);

// Loga (stderr) e limpa a exceção JS pendente, se houver. `where` identifica
// o ponto do host que estava executando JS.
void logPendingException(napi_env env, const char* where);

// Chama `callback` com this=global; exceções viram log (não derrubam o host).
void callJsLogged(napi_env env, napi_value callback, size_t argc,
                  const napi_value* argv, const char* where);

std::string toString(napi_env env, napi_value value);

// Propriedade nomeada; false se ausente/undefined/null.
bool getNamed(napi_env env, napi_value obj, const char* name, napi_value* out);
std::string getNamedString(napi_env env, napi_value obj, const char* name,
                           const char* fallback);
double getNamedNumber(napi_env env, napi_value obj, const char* name,
                      double fallback);

napi_value makeObject(napi_env env);
void setMethod(napi_env env, napi_value obj, const char* name,
               napi_callback cb);

// Objeto JS novo embrulhando um handle nativo; finalize roda no GC.
napi_value wrapHandle(napi_env env, void* handle, napi_finalize finalizer);
void finalizeNoop(napi_env env, void* data, void* hint);

// Handle nativo do `this` da chamada corrente (+ argumentos).
void* unwrapThis(napi_env env, napi_callback_info info, size_t* argc,
                 napi_value* args);
void* unwrapValue(napi_env env, napi_value obj);

napi_value resolvedPromise(napi_env env, napi_value value);

}  // namespace njs
