[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / SceneWalkResult

# Interface: SceneWalkResult

Defined in: [src/core/PerfTrace.ts:145](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L145)

Resultado de uma volta completa do [SceneWalk](../classes/SceneWalk.md).

## Properties

### frames

> **frames**: `number`

Defined in: [src/core/PerfTrace.ts:155](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L155)

Quadros que a volta levou — a idade máxima do dado.

***

### total

> **total**: `number`

Defined in: [src/core/PerfTrace.ts:147](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L147)

Nós da árvore (inclusive os invisíveis — o `updateMatrixWorld` desce neles).

***

### unchanged

> **unchanged**: `number`

Defined in: [src/core/PerfTrace.ts:151](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L151)

Nós com a matriz local igual à da volta anterior.

***

### visible

> **visible**: `number`

Defined in: [src/core/PerfTrace.ts:149](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L149)

Nós com visibilidade efetiva (o `visible` do three é herdado).

***

### visibleNodes

> **visibleNodes**: [`VisibleNode`](VisibleNode.md)[]

Defined in: [src/core/PerfTrace.ts:153](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L153)

Nós de cena no frustum, do mais caro (triângulos) pro menos.
