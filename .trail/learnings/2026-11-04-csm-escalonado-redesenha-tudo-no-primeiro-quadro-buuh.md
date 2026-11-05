---
title: "CSM escalonado redesenha todas as cascatas no 1º quadro: senão a distante amostra mapa nunca desenhado"
author: Buuh
date: 2026-11-04
branch: perf/fase3-integracao
id: l-0e0a277c
scope: repo
status: active
src: agent
touches:
  - src/scene/CameraFollowingCSM.ts
  - tests/scene/csmStagger.test.ts
  - docs/specs/SPEC-0675-lixo-por-quadro-da-engine.md
---

## Decided
No caminho `three` (Studio, navegador; sem espelho nativo) o `_escalonarCascatas` força todas as cascatas no 1º quadro escalonado. Antes, com o default 2 e 3 cascatas, o 1º quadro era `110`: a cascata 2 pulava o redesenho e o shader amostrava a textura de profundidade zerada, e a faixa distante inteira saía em sombra por 1 quadro (até `intervalo − 1` com intervalo maior).

## Tried and ruled out
- Contar com a troca de câmera para cobrir o 1º quadro: o `_init` do `CSMShadowNode` (three 0.184) já guarda a câmera do build em `this.camera`, então `trocouCamera` é false no 1º `updateBefore`.
- Teleporte com a mesma câmera forçando todas: o atraso de 1 quadro na cascata distante é o que a SPEC-0675 aceita, e no export nativo o escalonamento nem roda (o passe nativo é dono do `autoUpdate`).

## Watch out
- O `updateBefore` do CSM roda antes do ShadowNode de cada cascata no mesmo render: o `autoUpdate` posto ali vale já para o quadro corrente.
- O teste do escalonamento (`csmStagger.test.ts`) começa com `autoUpdate = true` nas cascatas falsas: ele só pega o caso se o padrão esperado do 1º quadro for `111`.

In the code: src/scene/CameraFollowingCSM.ts (`_escalonarCascatas`, flag `primeiro`); tests/scene/csmStagger.test.ts; SPEC-0675 (c).
