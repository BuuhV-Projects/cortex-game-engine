[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / overlayLogic

# Function: overlayLogic()

> **overlayLogic**(`overlay`): `Record`\<`string`, [`LogicDefinition`](../type-aliases/LogicDefinition.md)\>

Defined in: [src/scene/SceneBuilder.ts:221](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L221)

Lê `data.logic` da overlay — os **Logic Bricks** autorados no editor por id
(validados). Sobrescreve o `logic` do nó (JSON). Ver [LogicBricksSystem](../classes/LogicBricksSystem.md).

## Parameters

### overlay

[`SceneFileV1`](../interfaces/SceneFileV1.md) \| `null` \| `undefined`

## Returns

`Record`\<`string`, [`LogicDefinition`](../type-aliases/LogicDefinition.md)\>
