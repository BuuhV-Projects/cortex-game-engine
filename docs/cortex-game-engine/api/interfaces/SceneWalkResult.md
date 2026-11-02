[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / SceneWalkResult

# Interface: SceneWalkResult

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/core/PerfTrace.ts:279](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L279)

Resultado de uma volta completa do [SceneWalk](../classes/SceneWalk.md).

## Properties

### frames

> **frames**: `number`

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/core/PerfTrace.ts:289](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L289)

Quadros que a volta levou — a idade máxima do dado.

***

### total

> **total**: `number`

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/core/PerfTrace.ts:281](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L281)

Nós da árvore (inclusive os invisíveis — o `updateMatrixWorld` desce neles).

***

### unchanged

> **unchanged**: `number`

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/core/PerfTrace.ts:285](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L285)

Nós com a matriz local igual à da volta anterior.

***

### visible

> **visible**: `number`

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/core/PerfTrace.ts:283](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L283)

Nós com visibilidade efetiva (o `visible` do three é herdado).

***

### visibleNodes

> **visibleNodes**: [`VisibleNode`](VisibleNode.md)[]

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/core/PerfTrace.ts:287](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L287)

Nós de cena no frustum, do mais caro (triângulos) pro menos.
