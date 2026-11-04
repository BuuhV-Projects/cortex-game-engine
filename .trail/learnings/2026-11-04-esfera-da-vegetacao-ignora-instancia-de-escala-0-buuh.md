---
title: "Esfera de culling da Vegetation ignora instância de escala 0: o vão do writeInstances esticava a esfera até a origem"
author: Buuh
date: 2026-11-04
branch: perf/fase3-integracao
id: l-63addf01
scope: repo
status: active
src: agent
touches:
  - src/scene/vegetationMatrices.ts
  - tests/scene/VegetationWrite.test.ts
  - docs/specs/SPEC-0675-lixo-por-quadro-da-engine.md
---

## Decided
O `writeOne` (vegetationMatrices.ts) não une à esfera da malha a instância de escala 0 (o vão que o `writeInstances` abre além do total, e a escondida pela máscara da estrada). A matriz nula leva a esfera da geometria para (0,0,0) com raio 0, e o `unite` só ignorava raio negativo: com a floresta longe da origem, a esfera da malha ia da origem até ela e o culling da SPEC-0299 parava de cortar.

## Watch out
- O defeito não é só do caminho por faixa: a escrita inteira (`sync`) passa pelo mesmo vão zerado, e o `InstancedMesh.computeBoundingSphere` do three faz igual. A correção no `writeOne` cobre os dois.
- Instância de escala 0 continua com a matriz escrita (nula): só a esfera a ignora. Se todas forem escala 0, a esfera fica vazia e a malha é cortada, o que é certo porque nada desenha.
- Teste de esfera com uma árvore só: a copa do placeholder fica a ~3 m de altura, então a esfera não contém o ponto do chão; compare o centro com folga.

In the code: src/scene/vegetationMatrices.ts (`writeOne`, `unite`); tests/scene/VegetationWrite.test.ts ("o vão de escala 0 não estica a esfera até a origem"); SPEC-0675 (b) item 6.
