[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / buildTilemap

# Function: buildTilemap()

> **buildTilemap**(`options`): [`Tilemap`](../interfaces/Tilemap.md)

Defined in: [src/scene/Tilemap.ts:62](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Tilemap.ts#L62)

Constrói uma **camada de tilemap**: um único `Mesh` (geometria mesclada) onde
cada célula não-vazia é um quad com UV recortado no tileset. Unlit + nearest
(pixel art). Ideal pra níveis 2D por tiles. Veja [Tilemap.addColliders](../interfaces/Tilemap.md#addcolliders)
pra colisão.

## Parameters

### options

[`TilemapOptions`](../interfaces/TilemapOptions.md)

## Returns

[`Tilemap`](../interfaces/Tilemap.md)

## Example

```ts
const tex = await new AssetLoader().loadTexture('tiles.png', { pixelated: true })
const map = buildTilemap({ tileset: tex, tileWidth: 16, tileHeight: 16, tileSize: 1,
  data: [[-1,-1,-1],[0,0,0],[1,2,1]] })
game.scene.add(map.mesh)
map.addColliders(game.world) // chão sólido
```
