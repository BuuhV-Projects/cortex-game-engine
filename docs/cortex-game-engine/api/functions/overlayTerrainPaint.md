[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / overlayTerrainPaint

# Function: overlayTerrainPaint()

> **overlayTerrainPaint**(`overlay`): `Record`\<`string`, [`TerrainPaintData`](../interfaces/TerrainPaintData.md)\>

Defined in: [src/scene/SceneBuilder.ts:344](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L344)

Lê `data.terrainPaint` da overlay — a **pintura de textura do terreno** autorada
no editor por id (`{ [id]: TerrainPaintData }`: camadas + splatmap base64). Ver
[Terrain.setPaint](../classes/Terrain.md#setpaint).

## Parameters

### overlay

[`SceneFileV1`](../interfaces/SceneFileV1.md) \| `null` \| `undefined`

## Returns

`Record`\<`string`, [`TerrainPaintData`](../interfaces/TerrainPaintData.md)\>
