// Glue de embedding do Hermes UPSTREAM (facebook/hermes, ADR-0122) com API C
// mínima. Este header NÃO inclui nada do Hermes: o .cpp é compilado num alvo
// próprio que herda as flags/defines EXATOS do build do Hermes (via CMake) —
// incluir headers do VM com defines diferentes quebraria a ABI em silêncio.
// O resto do host só enxerga napi_env + estas funções.
#pragma once

#include <node_api.h>

#include <cstddef>
#include <cstdint>

extern "C" {

// Cria o vm::Runtime (microtask queue ligada por default). Devolve um handle
// opaco; destrua com cortexHermesDestroyRuntime (derruba o napi_env junto).
void* cortexHermesCreateRuntime();
void cortexHermesDestroyRuntime(void* runtime);

// napi_env sobre o runtime (hermes_napi_create_env). Vida = a do runtime.
napi_env cortexHermesCreateEnv(void* runtime);

// Executa bytecode .hbc. TOMA posse de `data` (malloc — o Hermes libera).
// Em erro, imprime a exceção no stderr e devolve false.
bool cortexHermesRunBytecode(void* runtime, napi_env env, uint8_t* data, size_t size, const char* url);

// Compila e executa fonte JS (fallback de dev). NÃO toma posse de `data`.
bool cortexHermesRunScript(void* runtime, napi_env env, const char* data, size_t size, const char* url);

// Esvazia a fila de microtasks (continuações de Promise/async).
void cortexHermesDrainJobs(void* runtime);

}  // extern "C"
