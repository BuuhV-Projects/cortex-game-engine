---
title: Fusão global da cena não refunde o que o jogo já fundiu por célula
author: Buuh
date: 2026-11-02
branch: claude/merge-subtree-chunks
cost: { minutes: 415, tokens: 1741234 }
id: l-a64c42ec
scope: repo
status: active
src: agent
touches:
  - docs/cortex-game-engine/api/classes/Terrain.md
  - docs/cortex-game-engine/api/functions/mergeSubtree.md
  - docs/cortex-game-engine/api/interfaces/TerrainOptions.md
  - docs/cortex-game-engine/api/interfaces/TerrainPaintData.md
  - docs/cortex-game-engine/api/interfaces/TerrainPaintLayer.md
  - docs/cortex-game-engine/api/variables/TERRAIN_MAX_LAYERS.md
  - docs/cortex-game-engine/architecture.md
  - docs/specs/SPEC-0666-merge-subtree-fica-fora-da-fusao-global.md
  - src/scene/StaticMerge.ts
  - tests/scene/mergeSubtree.test.ts
---

## Decided
A fusão estática global (mergeStaticScene) não pode refundir malhas que o jogo já fundiu por bloco com mergeSubtree: o mergeSubtree marca o resultado com cortexMergedStatic (SPEC-0666). Sem isso, as células espaciais da cidade do DDD 00 viravam malhas por material do tamanho do mapa no export, e o frustum culling nunca descartava nada (5 M tris por quadro, GPU 279 ms).

## Tried and ruled out
Antes de achar isso, foram descartados: sombra, amostragem de sombra, vegetação, present mode e vertex shader. Fragment shader constante só tirou 1/3 do custo.

## Watch out
Gargalo de GPU que não muda com a resolução = volume de geometria. Para ver quem desenha, despeje os maiores draws do RenderServer._emitUntil (o take() do NativeRenderer só roda quando o objeto muda). E o measure.sh passava CORTEX_RENDER_SCALE vazio, que o host lê como escala 1: rodadas sem --scale não tinham SSAA.

In the code: src/scene/StaticMerge.ts (mergeSubtree), tests/scene/mergeSubtree.test.ts.
