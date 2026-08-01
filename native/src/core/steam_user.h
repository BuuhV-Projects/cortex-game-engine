// Jogador logado e overlay da Steam (ISteamFriends / ISteamUser / ISteamApps)
// — SPEC-0175. Como em `steam_stats.h`, tudo é no-op seguro sem Steam: strings
// vazias e `false`, nunca exceção.
#pragma once

#include <string>

namespace core {

// Nome de exibição do jogador (persona). "" sem Steam.
std::string steamPlayerName();

// SteamID64 do jogador COMO TEXTO — 64 bits não cabem no `number` do JS sem
// perda de precisão, então a fronteira usa string. "" sem Steam.
std::string steamPlayerId();

// Idioma que o jogador escolheu para ESTE jogo na Steam (ex.: "brazilian"),
// útil pra pré-selecionar o idioma do jogo (SPEC-0124). "" sem Steam.
std::string steamLanguage();

// Abre o overlay. `page` vazia abre o overlay padrão; valores aceitos pelo SDK:
// "Friends", "Community", "Players", "Settings", "OfficialGameGroup", "Stats",
// "Achievements". Devolve `false` sem Steam (ou com overlay indisponível).
bool steamOpenOverlay(const std::string& page);

}  // namespace core
