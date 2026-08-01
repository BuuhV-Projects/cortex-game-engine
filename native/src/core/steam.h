// Ciclo de vida da sessão Steamworks (release PC/Steam). Sem `-DCORTEX_STEAM` é
// tudo no-op (builds desktop/GDK intactos). Com o flag: relança-via-Steam +
// SteamAPI_Init no boot, RunCallbacks por frame, Shutdown no fim.
//
// O app id NÃO é constante de compilação — vem do `cortex.json` do jogo
// (ADR-0174), então um mesmo host serve qualquer título. As CAPACIDADES ficam
// em `steam_stats.h` (conquistas/stats) e `steam_user.h` (jogador/overlay).
//
// O Steamworks SDK é PRÉ-REQUISITO (baixe em partner.steamgames.com — atrás de
// login, como o GDK). Ver architecture.md (pré-requisitos).
#pragma once

#include <cstdint>

namespace core {

// Inicializa o Steamworks para `appId` (0 = jogo sem Steam → pula tudo e segue).
// Retorna `false` SÓ quando o app deve ENCERRAR porque a Steam vai relançá-lo
// (RestartAppIfNecessary) — o `main` sai nesse caso. Se a Steam estiver offline
// (ou sem `steam_appid.txt` em dev), loga e segue sem Steam (retorna `true`).
// No-op → `true` sem CORTEX_STEAM.
bool initSteam(std::uint32_t appId);

// Bombeia os callbacks da Steam — chamar UMA vez por frame. É o que mantém o
// estado do overlay em dia. No-op sem CORTEX_STEAM.
void runSteamCallbacks();

// Finaliza o Steamworks. No-op sem CORTEX_STEAM.
void shutdownSteam();

// `true` se o `SteamAPI_Init` deu certo e as interfaces estão vivas — é o que
// toda capacidade checa antes de tocar no SDK.
bool steamAvailable();

// App id efetivo desta sessão (0 sem Steam).
std::uint32_t steamAppId();

// Overlay da Steam aberto AGORA. Mantido por callback (`GameOverlayActivated_t`)
// e lido por polling — o jogo consulta no update pra pausar. `false` sem Steam.
bool steamOverlayActive();

}  // namespace core
