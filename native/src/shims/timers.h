// Shim de timers do browser: setTimeout/clearTimeout/setImmediate.
// Necessário também porque o Hermes agenda continuações de async/await via
// setImmediate quando a fila de jobs nativa não está ativa.
#pragma once

#include <node_api.h>

namespace shims {

// Registra setTimeout, clearTimeout, setImmediate e clearImmediate no global.
void registerTimers(napi_env env);

// Executa os timers vencidos em relação a `nowMs` (relógio do host).
void runTimers(napi_env env, double nowMs);

}  // namespace shims
