[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / TerrainOptions

# Interface: TerrainOptions

Defined in: [src/scene/Terrain.ts:17](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L17)

Opções de [Terrain](../classes/Terrain.md).

## Properties

### color?

> `optional` **color?**: `ColorRepresentation`

Defined in: [src/scene/Terrain.ts:28](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L28)

Cor base do material. Default verde-grama.

***

### heights?

> `optional` **heights?**: `ArrayLike`\<`number`\>

Defined in: [src/scene/Terrain.ts:26](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L26)

Heightmap inicial (row-major, `(res+1)²` alturas) — restaura a autoria; aceita array tipado (SPEC-0728).

***

### resolution?

> `optional` **resolution?**: `number`

Defined in: [src/scene/Terrain.ts:24](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L24)

Segmentos por lado (resolução da grade) — `(resolution+1)²` vértices. Mais =
detalhe mais fino, heightmap maior. Default `64`.

***

### size?

> `optional` **size?**: `number` \| \[`number`, `number`\]

Defined in: [src/scene/Terrain.ts:19](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Terrain.ts#L19)

Largura × profundidade em unidades de mundo (XZ). Número = quadrado. Default `50`.
