[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / SceneWalkResult

# Interface: SceneWalkResult

Defined in: [src/core/perfTrace/sceneCensus.ts:116](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/perfTrace/sceneCensus.ts#L116)

Resultado de uma volta completa do [SceneWalk](../classes/SceneWalk.md).

## Properties

### frames

> **frames**: `number`

Defined in: [src/core/perfTrace/sceneCensus.ts:126](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/perfTrace/sceneCensus.ts#L126)

Quadros que a volta levou — a idade máxima do dado.

***

### total

> **total**: `number`

Defined in: [src/core/perfTrace/sceneCensus.ts:118](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/perfTrace/sceneCensus.ts#L118)

Nós da árvore (inclusive os invisíveis — o `updateMatrixWorld` desce neles).

***

### unchanged

> **unchanged**: `number`

Defined in: [src/core/perfTrace/sceneCensus.ts:122](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/perfTrace/sceneCensus.ts#L122)

Nós com a matriz local igual à da volta anterior.

***

### visible

> **visible**: `number`

Defined in: [src/core/perfTrace/sceneCensus.ts:120](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/perfTrace/sceneCensus.ts#L120)

Nós com visibilidade efetiva (o `visible` do three é herdado).

***

### visibleNodes

> **visibleNodes**: [`VisibleNode`](VisibleNode.md)[]

Defined in: [src/core/perfTrace/sceneCensus.ts:124](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/perfTrace/sceneCensus.ts#L124)

Nós de cena no frustum, do mais caro (triângulos) pro menos.
