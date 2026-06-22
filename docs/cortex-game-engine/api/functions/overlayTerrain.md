[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / overlayTerrain

# Function: overlayTerrain()

> **overlayTerrain**(`overlay`): `Record`\<`string`, `number`[]\>

Defined in: [src/scene/SceneBuilder.ts:283](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L283)

Lê `data.terrain` da overlay — o **heightmap esculpido no editor** por id
(`{ [id]: number[] }`). Sobrescreve o `heights` do nó (JSON). Ver [Terrain](../classes/Terrain.md).

## Parameters

### overlay

[`SceneFileV1`](../interfaces/SceneFileV1.md) \| `null` \| `undefined`

## Returns

`Record`\<`string`, `number`[]\>
