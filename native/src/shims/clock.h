// Relógio monotônico de alta resolução pro JS (SPEC-0226):
// __cortexNow() → milissegundos como double, origem no start do processo.
//
// Existe porque o `performance.now()` do host caía em `Date.now()`, com
// resolução de 1 ms — cega para o que custa microssegundos por objeto, que é
// justamente o que precisamos medir no caminho de render.
#pragma once

#include <node_api.h>

namespace shims {

// Registra __cortexNow no global.
void registerClock(napi_env env);

}  // namespace shims
