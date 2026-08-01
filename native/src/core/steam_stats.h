// Conquistas e estatísticas da Steam (ISteamUserStats) — SPEC-0175.
//
// Sem Steam disponível (`core::steamAvailable()` falso, host sem CORTEX_STEAM,
// cliente offline) TODA função aqui é no-op segura: devolve `false`/`0` em vez
// de lançar. Um jogo com conquistas roda igual no export PC puro.
//
// `RequestCurrentStats` NÃO é chamado: o SDK 1.65 marca a função como não mais
// necessária (isteamuserstats.h:92) — o cliente Steam sincroniza stats e
// conquistas ANTES do processo do jogo começar, então os getters já valem no
// primeiro frame.
#pragma once

#include <cstdint>
#include <string>

namespace core {

// Marca a conquista como obtida. NÃO envia sozinha: `steamStoreStats()` é o que
// persiste no servidor e faz o toast aparecer — desbloqueie o que precisar e
// envie UMA vez.
bool steamSetAchievement(const std::string& id);

// Desmarca a conquista (dev/reset de progresso). Também exige `steamStoreStats()`.
bool steamClearAchievement(const std::string& id);

// `true` se a conquista já está desbloqueada para este jogador.
bool steamGetAchievement(const std::string& id);

// Stats inteiros e de ponto flutuante são chamadas SEPARADAS de propósito: o
// tipo é definido no painel do Steamworks e adivinhar pelo valor em runtime
// erraria silenciosamente num stat float que hoje calha de ser inteiro.
bool steamSetIntStat(const std::string& name, std::int32_t value);
bool steamSetFloatStat(const std::string& name, float value);
std::int32_t steamGetIntStat(const std::string& name);
float steamGetFloatStat(const std::string& name);

// Envia stats e conquistas pendentes ao servidor da Steam.
bool steamStoreStats();

}  // namespace core
