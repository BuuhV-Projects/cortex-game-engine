[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / VisibleNode

# Interface: VisibleNode

Defined in: [src/core/perfTrace/sceneCensus.ts:12](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/perfTrace/sceneCensus.ts#L12)

Um nó de cena visível na amostra.

## Properties

### id

> **id**: `string`

Defined in: [src/core/perfTrace/sceneCensus.ts:14](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/perfTrace/sceneCensus.ts#L14)

`node.id` da cena (o `buildScene` grava em `obj.name`).

***

### meshes

> **meshes**: `number`

Defined in: [src/core/perfTrace/sceneCensus.ts:16](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/perfTrace/sceneCensus.ts#L16)

Sub-malhas visíveis desse nó no frame.

***

### tris

> **tris**: `number`

Defined in: [src/core/perfTrace/sceneCensus.ts:18](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/perfTrace/sceneCensus.ts#L18)

Triângulos que o nó contribuiu.
