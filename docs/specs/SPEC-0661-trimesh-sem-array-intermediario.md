# SPEC-0661 — Índices do trimesh sem array JS intermediário

**Data:** 2026-11-02
**Status:** implementado

## Contexto

O `RapierPhysics.addTrimeshFromObject` monta o chão das rodas (terreno e ruas marcados com `cortexTerrain` e
`cortexRoad`). No DDD 00 isso soma ~1,2 milhão de vértices (73 objetos de rua e 159 de terreno). Os índices eram
copiados com `Uint32Array.from(idx.array)` e, sem índice, com `Uint32Array.from({ length }, fn)`. No Hermes, os dois
caminhos montam primeiro um array JS do tamanho da malha.

No export, com o heap já cheio da cidade, isso derrubava o boot em algumas rodadas, logo depois de carregar os
veículos: `RangeError: Requested an array size that fails to allocate: Requested elements = 524288`, com a pilha
`from` → `addTrimeshFromObject`. Nas rodadas que passavam, o mesmo pico de alocação pesava no GC da carga.

## Decisão

- Com índice: `new Uint32Array(idx.array)`, uma cópia entre arrays tipados sem array JS no meio.
- Sem índice: `sequentialIndices(n)`, que preenche o `Uint32Array` num laço.

## Consequências

- Mesma saída de antes (teste em `tests/physics/trimeshIndices.test.ts`); o pico de alocação da montagem do chão
  dos carros cai em um array JS por malha.
- Não muda a memória que o Rapier guarda: os índices continuam sendo copiados para o mundo físico.
