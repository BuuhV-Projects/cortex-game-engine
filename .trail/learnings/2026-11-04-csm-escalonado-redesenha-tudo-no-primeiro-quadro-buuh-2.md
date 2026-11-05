---
title: "CSM escalonado redesenha a cascata nunca desenhada no 1º quadro, no three e no passe nativo (SPEC-0690)"
author: Buuh
date: 2026-11-05
branch: perf/csm-nativa
id: l-4f28e81e
scope: repo
status: active
replaces: l-0e0a277c
src: agent
touches:
  - src/scene/CameraFollowingCSM.ts
  - src/scene/csm/CsmNativePass.ts
  - tests/scene/csmStagger.test.ts
  - docs/specs/SPEC-0675-lixo-por-quadro-da-engine.md
  - docs/specs/SPEC-0690-csm-nativa-com-receptores.md
---

## Decided
O escalonamento da cascata distante (SPEC-0675, `farCascadeInterval`) vale nos dois caminhos. No caminho `three` (Studio, navegador; sem espelho nativo) o `_escalonarCascatas` força todas as cascatas no 1º quadro escalonado; antes, com o default 2 e 3 cascatas, o 1º quadro era `110`, a cascata 2 pulava o redesenho e a faixa distante inteira saía em sombra por 1 quadro. Desde a SPEC-0690 o passe nativo (`CsmNativePass.draw`) aplica o mesmo intervalo no export: a cascata nunca desenhada, ou recusada no último desenho, é desenhada no quadro corrente (`!receiver.enabled`), e o `updateMatrices` só roda dentro do desenho, então o receptor (nativo, que guarda a matriz do último desenho, ou do `three`) nunca lê uma matriz de um quadro sem desenho.

## Tried and ruled out
- Contar com a troca de câmera para cobrir o 1º quadro: o `_init` do `CSMShadowNode` (three 0.184) já guarda a câmera do build em `this.camera`, então `trocouCamera` é false no 1º `updateBefore`.
- Teleporte com a mesma câmera forçando todas: o atraso de 1 quadro na cascata distante é o que a SPEC-0675 aceita.
- Deixar o escalonamento fora do export (o learning anterior, l-0e0a277c): valia quando o passe nativo era dono do `autoUpdate` e chamava `updateMatrices` em todo quadro; com a CSM nativa da SPEC-0690 a matriz só muda no desenho, e redesenhar as duas cascatas todo quadro é custo sem ganho.

## Watch out
- O `updateBefore` do CSM roda antes do ShadowNode de cada cascata no mesmo render: o `autoUpdate` posto ali vale já para o quadro corrente.
- O teste do escalonamento (`csmStagger.test.ts`) começa com `autoUpdate = true` nas cascatas falsas: ele só pega o caso se o padrão esperado do 1º quadro for `111`.
- No nativo, quem cobre o 1º quadro é o `!receiver.enabled` do `devida`: tirar essa condição volta a amostrar mapa vazio na faixa distante.

In the code: src/scene/CameraFollowingCSM.ts (`_escalonarCascatas`, flag `primeiro`); src/scene/csm/CsmNativePass.ts (`draw`, `devida`); tests/scene/csmStagger.test.ts; SPEC-0675 (c), SPEC-0690 (§1).
