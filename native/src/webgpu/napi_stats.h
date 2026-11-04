// Exposição ao JS dos contadores por-frame do caminho de render (SPEC-0134).
// Os contadores em si (struct, bump*(), NapiTimer) ficam em napi_frame_stats.h,
// sem NAPI (SPEC-0688). O snapshot do ÚLTIMO frame completo é exposto em
// __cortexNapiStats(); o frame corrente é zerado no runFrame via
// resetNapiStatsFrame().
#pragma once

#include <node_api.h>

#include "napi_frame_stats.h"

namespace webgpu {

// Fecha o frame: snapshot do corrente → último e zera o corrente. Chamado no
// runFrame (main.cpp), depois do present.
void resetNapiStatsFrame();

// Instala __cortexNapiStats() no global (devolve o último frame completo).
void registerNapiStats(napi_env env);

}  // namespace webgpu
