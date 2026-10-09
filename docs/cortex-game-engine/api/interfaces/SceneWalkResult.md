[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / SceneWalkResult

# Interface: SceneWalkResult

Defined in: [src/core/PerfTrace.ts:248](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L248)

Resultado de uma volta completa do [SceneWalk](../classes/SceneWalk.md).

## Properties

### frames

> **frames**: `number`

Defined in: [src/core/PerfTrace.ts:258](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L258)

Quadros que a volta levou — a idade máxima do dado.

***

### total

> **total**: `number`

Defined in: [src/core/PerfTrace.ts:250](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L250)

Nós da árvore (inclusive os invisíveis — o `updateMatrixWorld` desce neles).

***

### unchanged

> **unchanged**: `number`

Defined in: [src/core/PerfTrace.ts:254](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L254)

Nós com a matriz local igual à da volta anterior.

***

### visible

> **visible**: `number`

Defined in: [src/core/PerfTrace.ts:252](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L252)

Nós com visibilidade efetiva (o `visible` do three é herdado).

***

### visibleNodes

> **visibleNodes**: [`VisibleNode`](VisibleNode.md)[]

Defined in: [src/core/PerfTrace.ts:256](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L256)

Nós de cena no frustum, do mais caro (triângulos) pro menos.
