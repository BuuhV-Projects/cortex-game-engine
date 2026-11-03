---
title: "Simplificar kit preserva a UV: erro com UV e normal e costura travada, senão a textura das ruas estica"
author: Buuh
date: 2026-11-03
branch: claude/track-texture-deformation-069fbd
cost: { minutes: 1, tokens: 1434 }
id: l-0bbb2655
scope: repo
status: active
src: agent
touches:
  - native/scripts/refine-asset.mjs
  - tests/native/refine-asset.test.ts
---

## Decided
O simplificador de kit agora leva a UV e a normal no cálculo do erro e trava os vértices de costura. Com só a posição, peça plana não tem erro geométrico: o meshoptimizer juntava os vértices do meio e a UV espelhada do asfalto virava listra (ruas do DDD 00). Os −31% de triângulos do city_kit eram quase todos essa deformação; do jeito certo ele cai só 3%.

## Tried and ruled out
- Só a UV e a normal no erro, sem travar a costura: o meshoptimizer 0.22 ainda junta vértices ao longo da costura (36 peças do city_kit com a UV fora do lugar, até 1,1).
- Peso de UV 10 em vez de 1: quase nada muda (29 peças).
- O weld() não é culpado: o erro de UV só com o weld é igual ao controle.

## Watch out
- O prune() padrão apaga a TEXCOORD_0 de material sem textura (keepAttributes é false). No modo simplify ele roda com keepAttributes: true.
- Teste de UV não pode olhar só os vértices: a LockBorder segura as pontas da crista na borda, e "max v = 1" passa mesmo com o código quebrado. É preciso amostrar a UV interpolada no meio da peça.
- Medir erro de UV por vértice dá ruído na costura (mesma posição, UV diferente). Meça pelo centróide de cada triângulo original contra o triângulo novo coplanar que melhor reproduz a UV, e rode o controle (original contra original).

In the code:
- native/scripts/refine-asset.mjs: seamLock(), attributeAwareSimplifier() passado ao simplifyPrimitive(); MeshoptSimplifier.useExperimentalFeatures = true (meshoptimizer 0.22.0, pinado).
- tests/native/refine-asset.test.ts: helper uvNoPonto(); no código antigo o centro dá v = 0,05 em vez de 1.
- SPEC-0670; o kit do DDD 00 voltou ao original (ddd00-game PR #21).
