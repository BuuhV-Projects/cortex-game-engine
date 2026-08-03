# 0185 - `uiPrev`/`uiNext` ganham teclado (Q/E)

**Data:** 2026-08-03
**Status:** aceito

## Contexto

Playtest de um jogo que consome a engine: "não tem comando de teclado no hub, só
de controle".

A warp room desse jogo é navegada por quatro ações da camada de input
(ADR-0164). Três tinham binding de teclado; **duas das quatro não tinham
nenhum**:

| ação | teclado | gamepad |
|---|---|---|
| `uiBack` | `Escape`, `Backspace` | `pad:1` (B) |
| `uiConfirm` | `Enter`, `Space` | `pad:0` (A) |
| `uiPrev` | — | `pad:4` (LB) |
| `uiNext` | — | `pad:5` (RB) |

`uiPrev`/`uiNext` nasceram como "os ombros do controle" e ficaram só com o
binding de gamepad. Qualquer tela que dependa delas — folhear mundos, abas,
páginas — fica **inoperável no teclado**, e nada acusa: as ações existem,
respondem, e simplesmente nunca disparam sem um controle conectado.

O projeto tem a regra de que tudo precisa ser 100% navegável no controle; o
inverso não estava garantido.

## Decisão

`uiPrev` ganha `key:q` e `uiNext` ganha `key:e`, mantendo `pad:4`/`pad:5`.

Q/E é o par de teclado equivalente aos ombros — o mesmo gesto de "folhear" que
LB/RB fazem, e a convenção já usada por jogos para trocar item/arma/aba.

Alternativas descartadas:

- **Setas ← →**: intuitivas para navegar, mas `moveLeft`/`moveRight` já as usam
  por default. Numa tela que também é jogável (o caso da warp room, onde o
  jogador anda), trocar de página moveria o personagem junto.
- **PageUp/PageDown**: sem conflito, mas pouco descobrível e longe da mão que
  está no WASD.

**Cuidado para quem consome:** `interact` é `key:e` por default, então uma tela
que use `interact` E `uiNext` ao mesmo tempo passa a ter as duas disparando na
mesma tecla. Telas de seleção devem usar `uiConfirm` (Enter/Space/A) para
confirmar — que é o binding esperado numa UI — e deixar o `interact` para o
mundo jogável. Foi o ajuste feito no jogo junto com esta mudança.

## Consequências

- Telas navegáveis por `uiPrev`/`uiNext` passam a funcionar no teclado sem que
  cada jogo precise redescobrir isso.
- Como são **defaults**, quem quiser outra tecla remapeia na tela de Controles
  (ADR-0164) — nada aqui é fixo.
- Jogos que já usam `interact` junto com `uiNext` na mesma tela precisam separar
  as duas coisas (ver o cuidado acima).
