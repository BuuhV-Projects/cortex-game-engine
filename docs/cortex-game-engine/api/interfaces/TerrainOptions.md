[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / TerrainOptions

# Interface: TerrainOptions

Defined in: [src/scene/Terrain.ts:20](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L20)

Opções de [Terrain](../classes/Terrain.md).

## Properties

### color?

> `optional` **color?**: `ColorRepresentation`

Defined in: [src/scene/Terrain.ts:31](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L31)

Cor base do material. Default verde-grama.

***

### heights?

> `optional` **heights?**: `number`[]

Defined in: [src/scene/Terrain.ts:29](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L29)

Heightmap inicial (row-major, `(res+1)²` alturas) — restaura a autoria.

***

### resolution?

> `optional` **resolution?**: `number`

Defined in: [src/scene/Terrain.ts:27](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L27)

Segmentos por lado (resolução da grade) — `(resolution+1)²` vértices. Mais =
detalhe mais fino, heightmap maior. Default `64`.

***

### size?

> `optional` **size?**: `number` \| \[`number`, `number`\]

Defined in: [src/scene/Terrain.ts:22](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L22)

Largura × profundidade em unidades de mundo (XZ). Número = quadrado. Default `50`.
