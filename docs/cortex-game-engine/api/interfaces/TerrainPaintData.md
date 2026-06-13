[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / TerrainPaintData

# Interface: TerrainPaintData

Defined in: [src/scene/Terrain.ts:43](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L43)

Pintura do terreno serializável (camadas + splatmap) — persistência do editor.

## Properties

### layers

> **layers**: [`TerrainPaintLayer`](TerrainPaintLayer.md)[]

Defined in: [src/scene/Terrain.ts:45](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L45)

Camadas em uso (1–4; o índice é o canal RGBA do splatmap).

***

### size

> **size**: `number`

Defined in: [src/scene/Terrain.ts:47](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L47)

Lado do splatmap (quadrado, `size×size` texels).

***

### splat

> **splat**: `string`

Defined in: [src/scene/Terrain.ts:49](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L49)

Pesos RGBA do splatmap (`size*size*4` bytes) em base64.
