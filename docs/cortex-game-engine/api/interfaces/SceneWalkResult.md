[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / SceneWalkResult

# Interface: SceneWalkResult

Defined in: [src/core/PerfTrace.ts:276](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L276)

Resultado de uma volta completa do [SceneWalk](../classes/SceneWalk.md).

## Properties

### frames

> **frames**: `number`

Defined in: [src/core/PerfTrace.ts:286](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L286)

Quadros que a volta levou — a idade máxima do dado.

***

### total

> **total**: `number`

Defined in: [src/core/PerfTrace.ts:278](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L278)

Nós da árvore (inclusive os invisíveis — o `updateMatrixWorld` desce neles).

***

### unchanged

> **unchanged**: `number`

Defined in: [src/core/PerfTrace.ts:282](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L282)

Nós com a matriz local igual à da volta anterior.

***

### visible

> **visible**: `number`

Defined in: [src/core/PerfTrace.ts:280](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L280)

Nós com visibilidade efetiva (o `visible` do three é herdado).

***

### visibleNodes

> **visibleNodes**: [`VisibleNode`](VisibleNode.md)[]

Defined in: [src/core/PerfTrace.ts:284](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L284)

Nós de cena no frustum, do mais caro (triângulos) pro menos.
