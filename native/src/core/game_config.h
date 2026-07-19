// Identidade do jogo lida do cortex.json ao lado do exe (ADR-0126).
// Responsabilidade única: dar ao host o ID estável (pasta de saves) e o NOME de
// exibição (título da janela) sem depender do nome do EXE — que no export é fixo
// (`launcher.exe`) e, se fosse a chave, faria jogos diferentes colidirem saves.
#pragma once

#include <string>

namespace core {

struct GameConfig {
  std::string id;    // slug estável → pasta de saves (SDL_GetPrefPath)
  std::string name;  // exibição → título da janela / Meus Programas
};

// Lê `<baseDir>/cortex.json` e extrai `id`/`name`. Ausência ou parse falho cai
// no `fallbackSlug` (o basename do dir/exe): `id = cortex.id ?? fallbackSlug`,
// `name = cortex.name ?? id`. Nunca lança; campos vazios contam como ausentes.
GameConfig loadGameConfig(const std::string& baseDir, const std::string& fallbackSlug);

}  // namespace core
