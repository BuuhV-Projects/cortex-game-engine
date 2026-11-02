[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / TerrainOptions

# Interface: TerrainOptions

Defined in: [src/scene/Terrain.ts:23](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L23)

Opções de [Terrain](../classes/Terrain.md).

## Properties

### color?

> `optional` **color?**: `ColorRepresentation`

Defined in: [src/scene/Terrain.ts:34](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L34)

Cor base do material. Default verde-grama.

***

### heights?

> `optional` **heights?**: `number`[]

Defined in: [src/scene/Terrain.ts:32](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L32)

Heightmap inicial (row-major, `(res+1)²` alturas) — restaura a autoria.

***

### resolution?

> `optional` **resolution?**: `number`

Defined in: [src/scene/Terrain.ts:30](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L30)

Segmentos por lado (resolução da grade) — `(resolution+1)²` vértices. Mais =
detalhe mais fino, heightmap maior. Default `64`.

***

### size?

> `optional` **size?**: `number` \| \[`number`, `number`\]

Defined in: [src/scene/Terrain.ts:25](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L25)

Largura × profundidade em unidades de mundo (XZ). Número = quadrado. Default `50`.
