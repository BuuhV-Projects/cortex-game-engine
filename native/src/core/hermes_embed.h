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

// Coleta de lixo COMPLETA, sob demanda (ADR-0153). Os wrappers de recurso GPU
// são objetos JS minúsculos segurando MBs nativos — sem pressão de heap, o GC
// podia nunca rodar e os finalizers (wgpu*Release) nunca liberavam a VRAM da
// fase anterior. O engine chama isto (via __cortexGC) no teardown de fase.
void cortexHermesCollectGarbage(void* runtime);

// Telemetria temporária (SPEC-0152): grava heap snapshot (formato V8) em
// `path` — pra investigar retenção de memória por troca de fase.
void cortexHermesHeapSnapshot(void* runtime, const char* path);

// Heap JS ALOCADO, em MB (SPEC-0188): leitura leve (sem forçar GC) do
// GCBase::HeapInfo — pro perf-log.txt acompanhar o heap Hermes ao longo da
// sessão (diagnóstico de estouro do teto de 512 MB, ver cortexHermesCreateRuntime).
double cortexHermesHeapUsedMB(void* runtime);

// Bytes retidos como memória EXTERNA (C++ heap) por objetos JS finalizáveis —
// ArrayBuffers grandes, strings externas — em MB (SPEC-0188). É o campo que
// aparece no HermesGC OOM (`external = ...`) quando o teto estoura por isso,
// não pelo heap gerenciado (`allocatedBytes`/cortexHermesHeapUsedMB).
double cortexHermesExternalBytesMB(void* runtime);

}  // extern "C"
