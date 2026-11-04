[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / countNodes

# Function: countNodes()

> **countNodes**(`scene`): `object`

Defined in: [src/core/perfTrace/sceneCensus.ts:56](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/perfTrace/sceneCensus.ts#L56)

Tamanho da árvore de cena (SPEC-0227). Duas contagens porque as duas fases
mais caras do render percorrem conjuntos diferentes: o `updateMatrixWorld`
desce em TODOS os nós, inclusive invisíveis; o culling para em subárvore
invisível.

## Parameters

### scene

`Object3D`

## Returns

`object`

### total

> **total**: `number`

### visible

> **visible**: `number`
