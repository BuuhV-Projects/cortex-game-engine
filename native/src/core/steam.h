// Integração com o Steamworks SDK (release PC/Steam). Sem `-DCORTEX_STEAM` é
// tudo no-op (builds desktop/GDK intactos). Com o flag: relança-via-Steam +
// SteamAPI_Init no boot, RunCallbacks por frame, Shutdown no fim — base pra
// overlay, conquistas e cloud save.
//
// O Steamworks SDK é PRÉ-REQUISITO (baixe em partner.steamgames.com — atrás de
// login, como o GDK). Ver architecture.md (pré-requisitos).
#pragma once

namespace core {

// Inicializa o Steamworks. Retorna `false` SÓ quando o app deve ENCERRAR porque
// a Steam vai relançá-lo (RestartAppIfNecessary) — o `main` sai nesse caso. Se a
// Steam estiver offline (ou sem `steam_appid.txt` em dev), loga e segue sem Steam
// (retorna `true`). No-op → `true` sem CORTEX_STEAM.
bool initSteam();

// Bombeia os callbacks da Steam — chamar UMA vez por frame. No-op sem CORTEX_STEAM.
void runSteamCallbacks();

// Finaliza o Steamworks. No-op sem CORTEX_STEAM.
void shutdownSteam();

}  // namespace core
