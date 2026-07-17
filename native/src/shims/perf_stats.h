// Shim de métricas de processo pro HUD de debug (export --debug):
// __cortexPerfStats() → { cpuPercent, memMB, gpuMemMB }.
// - cpuPercent: % de CPU do PROCESSO desde a última chamada (todas as threads,
//   normalizado pelo nº de cores — 100% = máquina inteira).
// - memMB: working set do processo.
// - gpuMemMB: memória de vídeo em uso pelo processo (DXGI budget local).
#pragma once

#include <node_api.h>

namespace shims {

// Registra __cortexPerfStats no global.
void registerPerfStats(napi_env env);

}  // namespace shims
