// Ponte JS ↔ Steamworks (SPEC-0175): publica as capacidades da Steam como
// globais `__cortexSteam*`, consumidas pela fachada `Steam` do engine
// (src/core/steamworks.ts).
//
// Só EXPÕE — a lógica mora em core/steam*.{h,cpp}. Sem Steam disponível cada
// global devolve o valor neutro (`false`/`0`/`''`), então o mesmo bundle roda no
// export PC puro.
#pragma once

#include <node_api.h>

namespace shims {

// Registra no global: __cortexSteamAvailable/AppId, Set/Clear/GetAchievement,
// Set/GetIntStat, Set/GetFloatStat, StoreStats, PlayerName/PlayerId, Language,
// OverlayActive/OpenOverlay.
void registerSteamApi(napi_env env);

}  // namespace shims
