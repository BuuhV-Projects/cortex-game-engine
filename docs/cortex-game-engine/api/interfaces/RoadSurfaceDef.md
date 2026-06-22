[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / RoadSurfaceDef

# Interface: RoadSurfaceDef

Defined in: [src/road/surfaces.ts:12](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/road/surfaces.ts#L12)

Superfície resolvida: caminhos das texturas + cor de fallback + tile.

## Properties

### color

> **color**: `string` \| `number`

Defined in: [src/road/surfaces.ts:14](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/road/surfaces.ts#L14)

Cor base (hex number ou string — three aceita ambos). Usada sem textura.

***

### diffuse?

> `optional` **diffuse?**: `string`

Defined in: [src/road/surfaces.ts:16](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/road/surfaces.ts#L16)

Caminho do diffuse (relativo ao projeto), ou `undefined` p/ cor sólida.

***

### normal?

> `optional` **normal?**: `string`

Defined in: [src/road/surfaces.ts:18](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/road/surfaces.ts#L18)

Caminho do normal map (opcional).

***

### repeat

> **repeat**: `number`

Defined in: [src/road/surfaces.ts:20](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/road/surfaces.ts#L20)

Unidades de mundo por tile no comprimento (default 8 m).
