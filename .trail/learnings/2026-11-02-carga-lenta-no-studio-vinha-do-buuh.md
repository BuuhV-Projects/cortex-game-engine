---
title: "Carga lenta no Studio vinha do aquecimento de shaders, que agora não roda no editor"
author: Buuh
date: 2026-11-02
branch: claude/studio-slow-game-loading-2eb4fe
cost: { minutes: 1, tokens: 1407 }
id: l-1996239b
scope: repo
status: active
src: agent
touches:
  - "src/core/Game.ts#Game.precompile"
---

## Decided
O que deixava lenta a abertura de um jogo grande no Studio era o aquecimento de shaders, não o download de assets: um único quadro com a cena inteira revelada e sem culling, que no DDD 00 bloqueava 36–41 s dos ~70 s de carga. Ele protege a largada do jogo final, e no editor F2 não existe largada. Por isso o guard fica no engine (todos os jogos ganham), e não no main.ts de cada jogo.

## Tried and ruled out
- Culpar os assets: são 191 MB que terminam de baixar por volta de 29 s, em paralelo com o resto. Multidão, player e veículos somam ~3 s.
- Contar com um ganho de 40 s: sem o aquecimento, ~5 s voltam no 1º quadro do editor (só o que está visível). O ganho líquido é ~33 s por reload.

## Watch out
- setupCity variou de 4 a 31 s entre as rodadas, com caches quentes. A causa não foi investigada.
- Medir com o painel do navegador oculto congela o rAF, e a carga cooperativa para junto.
- Medir no Vite que o Studio usa faz o HMR recarregar o Studio do usuário.

In the code: a guard `if (this.editorActive) return` no topo de Game.precompile (SPEC-0657). Pra medir: uma cópia do jogo em outra porta (`vite --port 5180`), com junction de assets/, vendor/ e node_modules/; `?cortexDebug=boot` pros marcos do buildScene; PerformanceObserver de `long-animation-frame` com `buffered:true` pra achar o bloqueio; `performance.setResourceTimingBufferSize` logo depois de navegar (o padrão de 250 enche no boot).
