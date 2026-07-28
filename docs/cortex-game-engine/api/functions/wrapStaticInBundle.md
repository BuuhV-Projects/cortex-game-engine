[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / wrapStaticInBundle

# Function: wrapStaticInBundle()

> **wrapStaticInBundle**(`root`, `world?`, `extraDynamicRoots?`): `number`

Defined in: [src/scene/StaticMerge.ts:347](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/StaticMerge.ts#L347)

**Render bundles** (M-perf-2b / SPEC-0136) — envolve as subárvores ESTÁTICAS de
`root` num BundleGroup. O `WebGPURenderer` grava os comandos de draw
dessas malhas **uma vez** e no replay vira **1 `executeBundles`** por pass,
cortando as milhares de travessias JS→C++ (setPipeline/BindGroup/VertexBuffer/
draw) por frame no host nativo — o gargalo de render do PRD-0005.

Diferente do [mergeStaticScene](mergeStaticScene.md), NÃO exige geometria fundível: bundla
qualquer estático (inclusive `.glb` com buffers interleaved, que o merge
rejeita). Ficam FORA: entidades dinâmicas (ECS/script), animados, skinned,
água/vegetação/veículo, luzes/câmeras. Reparenta com `attach` (preserva o
world transform). O `BundleGroup` assume estrutura estática — reconstrua a cena
(novo `buildScene`) pra mudar. Roda DEPOIS do merge (bundla também as malhas
fundidas). Chame UMA vez, no fim do build.

## Parameters

### root

`Object3D`

### world?

[`World`](../classes/World.md)

### extraDynamicRoots?

`Iterable`\<`Object3D`\<`Object3DEventMap`\>\> = `[]`

## Returns

`number`

Nº de subárvores top-level colocadas no bundle.
