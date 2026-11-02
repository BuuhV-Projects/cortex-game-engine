# SPEC-0657 - `Game.precompile()` não faz nada com o editor (F2) ativo

**Data:** 2026-11-02
**Status:** aceito

## Contexto

Abrir o DDD 00 (Port Hollow) no Studio pra editar levava ~70 s. Medição no navegador (Vite dev, editor F2
ligado, caches HTTP e de shader quentes, `long-animation-frame` com `buffered: true`):

| etapa | tempo |
|---|---|
| `setupCity` | 4–31 s (ruidoso) |
| `buildScene` (2540 nós, 165 GLBs) | 5–7 s |
| multidão + player + veículos + grama + clima | ~3 s |
| **`game.precompile()`** | **36–41 s** |

O `precompile` (SPEC-0196, ADR-0262, ADR-0310) desenha UM quadro com a cena inteira revelada e sem culling pra
criar os pipelines antes do 1º quadro do jogador. No Port Hollow esse quadro é um único callback de rAF de ~40 s.
Ele existe pra evitar travadas na largada do jogo; no editor não há largada: a tela de carregamento já é pulada no
F2 (o jogo checa `game.editorActive`) e editar um script recarrega a página, pagando o aquecimento de novo a cada
reload.

A/B numa cópia do jogo, mesmo servidor, caches quentes: sem o aquecimento no editor, a carga termina em 13,5 s; o
1º quadro do editor passa a custar ~5 s (cria só o que está visível). Ganho líquido ~33 s por carga.

## Decisão

- `Game.precompile()` retorna logo no início quando `editorActive` é `true` — antes de `renderer.init()`, do
  trace de pipelines e do quadro de aquecimento.
- Vale pra todo jogo: o guard fica no engine, não em cada `main.ts`.
- Jogo final (sem editor), `?play=1` e o editor fechado continuam aquecendo como antes (`editorActive` é `false`).

## Consequências

- Ao apertar ▶ Play dentro do editor, os primeiros quadros podem travar enquanto os pipelines do que aparece
  compilam. Medir travada de largada no Studio exige bootar em play (`?play=1`) ou fechar o F2 antes da carga.
- O `playtest_game` do Chat IA boota em edição e aperta Play (SPEC-0277): também sem aquecimento. Sonda de tempo
  de quadro nos primeiros segundos depois do Play inclui compilação de shader — não é travada do jogo final.
- Jogo que chama `precompile()` de novo depois (ex.: forçar um caminho de pós-processamento) com o editor ativo
  também não aquece — mesma regra.
- Teste: `tests/core/gamePrecompileEditor.test.ts` (com o editor ativo não chama `renderer.init()`).
