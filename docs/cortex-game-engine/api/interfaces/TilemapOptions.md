[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / TilemapOptions

# Interface: TilemapOptions

Defined in: src/scene/Tilemap.ts:15

Opções de [buildTilemap](../functions/buildTilemap.md).

## Properties

### alphaTest?

> `optional` **alphaTest?**: `number`

Defined in: src/scene/Tilemap.ts:34

Recorte por alpha. Default `0.5`.

***

### data

> **data**: `number`[][]

Defined in: src/scene/Tilemap.ts:28

Grade do mapa: `data[linha][coluna]` = índice do tile no tileset (0-based,
topo-esquerda). **`< 0` (ex.: -1) = vazio**.

***

### origin?

> `optional` **origin?**: \[`number`, `number`\]

Defined in: src/scene/Tilemap.ts:32

Canto superior-esquerdo do mapa, em unidades. Default `[0, 0]`.

***

### tileHeight

> **tileHeight**: `number`

Defined in: src/scene/Tilemap.ts:21

Altura de um tile, em px.

***

### tileset

> **tileset**: `Texture`

Defined in: src/scene/Tilemap.ts:17

Textura do tileset (grade de tiles).

***

### tilesetColumns?

> `optional` **tilesetColumns?**: `number`

Defined in: src/scene/Tilemap.ts:23

Colunas no tileset. Default: `texW / tileWidth`.

***

### tileSize?

> `optional` **tileSize?**: `number`

Defined in: src/scene/Tilemap.ts:30

Tamanho de um tile em **unidades de mundo**. Default `1`.

***

### tileWidth

> **tileWidth**: `number`

Defined in: src/scene/Tilemap.ts:19

Largura de um tile no tileset, em **px**.
