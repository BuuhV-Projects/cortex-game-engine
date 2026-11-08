# ADR-0714 - Conquistas como recurso da engine, com a idempotência dentro dela

**Data:** 2026-11-07
**Status:** aceito
**Spec:** SPEC-0713

## Contexto

A engine tem a fachada `Steam` (SPEC-0175), um espelho fino do Steamworks: cada chamada vai direto à ponte nativa.
O Port Hollow precisou de conquistas por plataforma (Steam no PC, Xbox no futuro) e primeiro montou o wrapper e a
factory no próprio jogo (ADR-0209 do jogo). O usuário decidiu que isso é papel da engine: o jogo só avisa quando o
jogador ganhou a conquista, e a engine garante que ela seja registrada uma vez só.

## Alternativas

1. **Manter no jogo.** Cada jogo da engine reescreveria a escolha da plataforma e o controle de repetição, e o Xbox
   teria de entrar em cada jogo. Descartada.
2. **Idempotência na fachada `Steam`** (`unlockAchievement` passa a consultar antes). Muda o contrato de uma API que
   espelha o SDK (`clearAchievement` + `unlockAchievement` em ferramentas de dev passariam a se comportar diferente) e
   não resolve a escolha de plataforma. Descartada.
3. **Recurso `Achievements` separado, sobre `Steam` e `gamePlatform()`** (escolhida). A fachada `Steam` continua crua;
   `Achievements` é a camada de jogo, com factory por plataforma e cache por sessão.

## Decisão

- `src/core/achievements.ts`: interface `Achievements` (`unlock`, `has`, `backend`), `SteamAchievements`,
  `NullAchievements`, `createAchievements(platform, steam?)` e `loadAchievements()` memorizado.
- `SteamAchievements.unlock` consulta o cache da sessão e o `hasAchievement` antes de chamar `unlockAchievement` e
  `storeStats`; o envio acontece uma vez por conquista.
- **O padrão é sempre a `NullAchievements`** (decisão do usuário): qualquer plataforma sem implementação, valor
  desconhecido, falha ao ler a plataforma ou Steam indisponível cai nela, e nunca lança. Assim uma plataforma nova ou um
  `cortex.json` estranho nunca derruba o jogo; no pior caso, a conquista fica só na sessão.
- O Xbox fica previsto: hoje cai no padrão (nula). Quando houver o GDK, ele entra como outra classe que implementa
  `Achievements`, pela ponte nativa da engine, como a Steam, com um `case` próprio na factory.

## Consequências

- Jogos chamam só `achievements.unlock(id)` no momento da conquista; nada de `storeStats` à mão.
- `Steam.unlockAchievement` continua disponível para quem quer o controle cru (stats, reset de dev).
- O cache é por sessão: se o jogador limpar a conquista fora do jogo (`clearAchievement` pela ferramenta de dev) com o
  jogo aberto, o `unlock` seguinte não reenvia até reiniciar. Aceitável: é fluxo de desenvolvimento.
