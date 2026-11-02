---
title: Fusão global da cena não refunde o que o jogo já fundiu por célula; A/B de GPU só com hora e clima fixos
author: Buuh
date: 2026-11-02
branch: claude/render-scale-config
cost: { minutes: 80, tokens: 237277 }
id: l-5e92d577
scope: repo
status: active
replaces: l-a64c42ec
src: agent
touches:
  - CLAUDE.md
  - CHANGELOG.md
  - package.json
  - docs/cortex-game-engine/api/classes/Terrain.md
  - docs/cortex-game-engine/api/functions/mergeSubtree.md
  - docs/cortex-game-engine/api/interfaces/TerrainOptions.md
  - docs/cortex-game-engine/api/interfaces/TerrainPaintData.md
  - docs/cortex-game-engine/api/interfaces/TerrainPaintLayer.md
  - docs/cortex-game-engine/api/variables/TERRAIN_MAX_LAYERS.md
  - docs/cortex-game-engine/architecture.md
---

## Decided
A fusão estática global (mergeStaticScene) não refunde malhas que o jogo já fundiu por bloco com mergeSubtree: o mergeSubtree marca o resultado com cortexMergedStatic (SPEC-0666). Sem isso, as células espaciais da cidade do DDD 00 viravam malhas por material do tamanho do mapa no export, e o frustum culling nunca descartava nada (5,2 M → 3,2 M tris por quadro com a correção).

## Tried and ruled out
A conclusão de que o custo de GPU não dependia da resolução estava errada: as rodadas comparadas tinham hora do dia e clima diferentes (chuva/névoa, bloom). Com ?hora=12&clima=sol fixos, no DDD 00 em 4K interno: passe principal 93 ms, 64 ms em 540p, 53 ms com fragment constante, 16 ms sem os draws doubleSide; forçar cull de face traseira não muda nada.

## Watch out
Todo A/B de GPU no DDD 00 com hora e clima fixos e o tamanho do alvo conferido no perf-log (texturas depth24plus). Para ver quem desenha, despeje os draws do RenderServer._emitUntil (o take() do NativeRenderer só roda quando o objeto muda); um skipDraw nesse ponto pula o draw mas não os uploads do objeto.

In the code: src/scene/StaticMerge.ts (mergeSubtree), src/render/RenderServer.ts (_emitUntil).
