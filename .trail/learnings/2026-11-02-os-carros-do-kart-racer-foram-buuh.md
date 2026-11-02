---
title: Os carros do kart-racer foram gerados pelo GPT-6 Astra sem direcionamento de performance
author: Buuh
date: 2026-11-02
id: l-dbfe5e03
scope: repo
status: active
touches:
  - "src/scene/StaticMerge.ts#mergeSubtree"
---

## Decided
Os modelos 3D dos carros do kart-racer foram criados pelo **GPT-6 Astra**, a
pedido do usuário, **sem nenhum direcionamento sobre técnica de modelagem ou
performance**. É a causa raiz da perf ruim dos carros — não é um bug, é o
resultado esperado de um gerador sem restrição.

**O padrão medido (20/09/2026):** cada GLB de roda tem 6 primitivas com **6
materiais distintos** (pneu, cromo, disco, pinça, gunmetal, friso). Um material
por peça é a forma mais natural de *descrever* um objeto e a pior possível para
draw calls: o `mergeSubtree` agrupa por material, então nada funde e cada peça
vira uma draw. As 4 rodas sozinhas são 24 das 41 malhas de um carro. O corpo,
onde as peças compartilham material, funde bem (13–33 primitivas → 7–17 malhas).

**Why:** saber disso muda o diagnóstico de "o modelo é pesado" (triângulos, que
são GPU e não afetam o fps aqui) para "o modelo tem materiais demais" (que é
CPU e afeta). Também muda a solução: não é decimar, é unificar material.

## Watch out
ao achar um modelo com muitas malhas, conte **materiais por
primitiva** antes de culpar a geometria. E o plano do usuário — que vale
implementar — é incluir no **Chat IA do Cortex Game Engine** um trecho de
prompt que oriente o gerador de modelo 3D a respeitar técnicas de performance:
compartilhar material entre peças do mesmo acabamento, evitar um material por
peça, manter contagem de malhas baixa. Liga em perf-render-kart-racer e
chat-ia-skills-plugin.

_From Claude Code's memory of this repo, last updated Sep 20._
