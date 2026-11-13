[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / TerrainPaintInput

# Type Alias: TerrainPaintInput

> **TerrainPaintInput** = `Omit`\<[`TerrainPaintData`](../interfaces/TerrainPaintData.md), `"splat"`\> & `object`

Defined in: [src/scene/Terrain.ts:43](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L43)

Pintura a aplicar com [Terrain.setPaint](../classes/Terrain.md#setpaint): a [TerrainPaintData](../interfaces/TerrainPaintData.md) com o splatmap em base64 ou nos bytes
RGBA crus (`size*size*4`), que entram sem base64 (dado assado, SPEC-0728).

## Type Declaration

### splat

> **splat**: `string` \| `Uint8Array`
