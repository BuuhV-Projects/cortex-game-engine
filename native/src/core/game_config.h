// Identidade do jogo lida do cortex.json ao lado do exe (ADR-0126).
// Responsabilidade única: dar ao host o ID estável (pasta de saves) e o NOME de
// exibição (título da janela) sem depender do nome do EXE — que no export é fixo
// (`launcher.exe`) e, se fosse a chave, faria jogos diferentes colidirem saves.
#pragma once

#include <cstdint>
#include <string>

namespace core {

/** App id ausente/inválido no cortex.json — o host roda sem Steam (ADR-0174). */
inline constexpr std::uint32_t kNoSteamAppId = 0;

struct GameConfig {
  std::string id;    // slug estável → pasta de saves (SDL_GetPrefPath)
  std::string name;  // exibição → título da janela / Meus Programas
  /** Export com métricas (`--debug`): autoriza telemetria em arquivo (perf-log). */
  bool debug = false;
  /**
   * App id da Steam (ADR-0174) — DADO do projeto, não constante de compilação:
   * o Studio grava no cortex.json e o export `--steam` recusa build sem ele.
   * Serve ao `SteamAPI_RestartAppIfNecessary`, a única chamada que precisa do
   * número vindo de dentro do jogo (em produção quem informa é o cliente Steam).
   * {@link kNoSteamAppId} = não declarado → o host pula a Steam e segue.
   */
  std::uint32_t steamAppId = kNoSteamAppId;
};

// Lê `<baseDir>/cortex.json` e extrai `id`/`name`. Ausência ou parse falho cai
// no `fallbackSlug` (o basename do dir/exe): `id = cortex.id ?? fallbackSlug`,
// `name = cortex.name ?? id`. Nunca lança; campos vazios contam como ausentes.
GameConfig loadGameConfig(const std::string& baseDir, const std::string& fallbackSlug);

}  // namespace core
