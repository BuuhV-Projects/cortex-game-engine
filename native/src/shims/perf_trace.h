// Shim do perf trace de gameplay (SPEC-0198):
// __cortexPerfTrace(line) → acrescenta a linha em <logDir>/perf-trace.jsonl.
//
// A engine amostra periodicamente (fps, ms por seção, draws/tris, câmera e os
// nós visíveis) e chama este shim. O registro é o GATE: só acontece com as
// métricas ativas (export --debug, dev-run, CORTEX_VRAM_LOG), e a engine testa
// a existência da função antes de coletar — sem métricas, custo zero no frame.
//
// Arquivo próprio (JSONL), separado do perf-log.txt (texto humano de VRAM/heap):
// este aqui é pra ferramenta ler.
#pragma once

#include <node_api.h>

namespace shims {

// Registra __cortexPerfTrace no global e define o diretório de saída.
// Chame SÓ quando as métricas estiverem ativas.
void registerPerfTrace(napi_env env, const char* logDir);

}  // namespace shims
