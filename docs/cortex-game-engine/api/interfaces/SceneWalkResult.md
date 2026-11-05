[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / SceneWalkResult

# Interface: SceneWalkResult

Defined in: [src/core/PerfTrace.ts:137](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L137)

Resultado de uma volta completa do [SceneWalk](../classes/SceneWalk.md).

## Properties

### frames

> **frames**: `number`

Defined in: [src/core/PerfTrace.ts:147](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L147)

Quadros que a volta levou — a idade máxima do dado.

***

### total

> **total**: `number`

Defined in: [src/core/PerfTrace.ts:139](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L139)

Nós da árvore (inclusive os invisíveis — o `updateMatrixWorld` desce neles).

***

### unchanged

> **unchanged**: `number`

Defined in: [src/core/PerfTrace.ts:143](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L143)

Nós com a matriz local igual à da volta anterior.

***

### visible

> **visible**: `number`

Defined in: [src/core/PerfTrace.ts:141](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L141)

Nós com visibilidade efetiva (o `visible` do three é herdado).

***

### visibleNodes

> **visibleNodes**: [`VisibleNode`](VisibleNode.md)[]

Defined in: [src/core/PerfTrace.ts:145](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L145)

Nós de cena no frustum, do mais caro (triângulos) pro menos.
