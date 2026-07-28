[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / TilemapOptions

# Interface: TilemapOptions

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Tilemap.ts:15](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Tilemap.ts#L15)

Opções de [buildTilemap](../functions/buildTilemap.md).

## Properties

### alphaTest?

> `optional` **alphaTest?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Tilemap.ts:34](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Tilemap.ts#L34)

Recorte por alpha. Default `0.5`.

***

### data

> **data**: `number`[][]

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Tilemap.ts:28](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Tilemap.ts#L28)

Grade do mapa: `data[linha][coluna]` = índice do tile no tileset (0-based,
topo-esquerda). **`< 0` (ex.: -1) = vazio**.

***

### origin?

> `optional` **origin?**: \[`number`, `number`\]

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Tilemap.ts:32](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Tilemap.ts#L32)

Canto superior-esquerdo do mapa, em unidades. Default `[0, 0]`.

***

### tileHeight

> **tileHeight**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Tilemap.ts:21](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Tilemap.ts#L21)

Altura de um tile, em px.

***

### tileset

> **tileset**: `Texture`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Tilemap.ts:17](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Tilemap.ts#L17)

Textura do tileset (grade de tiles).

***

### tilesetColumns?

> `optional` **tilesetColumns?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Tilemap.ts:23](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Tilemap.ts#L23)

Colunas no tileset. Default: `texW / tileWidth`.

***

### tileSize?

> `optional` **tileSize?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Tilemap.ts:30](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Tilemap.ts#L30)

Tamanho de um tile em **unidades de mundo**. Default `1`.

***

### tileWidth

> **tileWidth**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Tilemap.ts:19](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Tilemap.ts#L19)

Largura de um tile no tileset, em **px**.
