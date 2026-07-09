#include "steam.h"

#include <cstdio>

#ifdef CORTEX_STEAM
#include <steam/steam_api.h>
// App id do título. 480 = Spacewar (app de teste público da Valve) — permite
// validar a integração ANTES de ter um app id real. O build de release define o
// id verdadeiro via -DCORTEX_STEAM_APPID=<id>.
#ifndef CORTEX_STEAM_APPID
#define CORTEX_STEAM_APPID 480
#endif
#endif

namespace core {

bool initSteam() {
#ifdef CORTEX_STEAM
  // Aberto fora da Steam? Relança pela Steam (em dev, `steam_appid.txt` ao lado
  // do exe evita o relaunch). Se relançar, este processo deve sair.
  if (SteamAPI_RestartAppIfNecessary(CORTEX_STEAM_APPID)) {
    std::fprintf(stderr, "[steam] relançando via Steam...\n");
    return false;
  }
  if (SteamAPI_Init()) {
    std::fprintf(stderr, "[steam] init OK\n");
  } else {
    // Steam offline / sem steam_appid.txt: o jogo roda, só sem overlay/conquistas.
    std::fprintf(stderr, "[steam] init falhou (Steam offline ou sem steam_appid.txt) — seguindo sem Steam\n");
  }
#endif
  return true;
}

void runSteamCallbacks() {
#ifdef CORTEX_STEAM
  SteamAPI_RunCallbacks();
#endif
}

void shutdownSteam() {
#ifdef CORTEX_STEAM
  SteamAPI_Shutdown();
#endif
}

}  // namespace core
