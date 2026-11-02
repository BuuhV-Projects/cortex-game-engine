---
title: "Objeto que só aparece no export nativo, empilhado perto da origem: nó com matrix manual perdia a pose no espelho"
author: Buuh
date: 2026-11-02
branch: claude/native-unwanted-track-object-5efaef
cost: { minutes: 43, tokens: 413006 }
id: l-b89e8060
scope: repo
status: active
src: agent
touches:
  - src/core/NativeSceneMirror.ts
  - tests/core/NativeSceneMirror.test.ts
  - docs/cortex-game-engine/architecture.md
  - docs/specs/SPEC-0658-espelho-respeita-matriz-manual.md
  - CHANGELOG.md
  - package.json
---

## Decided
O espelho de cena nativo manda ao C++ só posição/rotação/escala e o host recompõe a matriz. Nó com matrixAutoUpdate = false e pose escrita direto em `matrix` (padrão das células de fusão do Port Hollow/DDD 00) tem TRS identidade e era desenhado na origem do mundo. Correção: decompor `matrix` desses nós antes de mandar, no build e na linha de sincronização (o streaming suja o nó ao trocar visible, então a linha também zerava a pose).

## Tried and ruled out
- Cidade gerada diferente no Hermes: rodei grade+lotes no Hermes e no V8, saída idêntica.
- Export de outra versão do jogo: reflog mostra o mesmo commit da main no horário do export.
- Cook do GLB mexendo geometria/caixa: o cook só converte textura.
- InstancedMesh com capacidade > count desenhando instâncias identidade: não era o caso das peças vistas.
- mergeSubtree recentrando a malha: não recentra.

## Watch out
- Escrever em `matrix` depois do install não suja o nó no espelho (não há gancho em matrix); decompose perde cisalhamento.
- Para comparar Studio x nativo, reproduza a câmera exata pelo `cam` (x,y,z,dx,dy,dz) do perf-trace.jsonl com `game.inspect.pose` na sonda do navegador.
- No Port Hollow eram 573 malhas avulsas (528 mil tris) sempre na frente da câmera; o resto da carga do 1 fps (5,35 M tris da cidade, SSAA 2x, 738 malhas físicas recusadas pelo C++) é outra frente.

In the code: src/core/NativeSceneMirror.ts (descreverNo, _escreverLinhas, escreverTrsDaMatriz); SPEC-0658; tests/core/NativeSceneMirror.test.ts; jogo: city/build/cells.ts (Cells.add).
