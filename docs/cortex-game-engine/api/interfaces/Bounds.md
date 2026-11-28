[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / Bounds

# Interface: Bounds

Defined in: [src/scene/SceneAssets.ts:36](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L36)

Caixa delimitadora (axis-aligned) de um objeto em **world space**, com os
limites desempacotados em escalares. Use `maxX`/`minX`/`maxZ`/`minZ` pra
conectar peças pela borda real e `topY` pra empilhar algo no topo.

## Properties

### bottomY

> **bottomY**: `number`

Defined in: [src/scene/SceneAssets.ts:52](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L52)

Base do objeto (= `min.y`).

***

### center

> **center**: `Vector3`

Defined in: [src/scene/SceneAssets.ts:44](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L44)

Centro geométrico.

***

### max

> **max**: `Vector3`

Defined in: [src/scene/SceneAssets.ts:40](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L40)

Canto máximo (x,y,z) em world space.

***

### maxX

> **maxX**: `number`

Defined in: [src/scene/SceneAssets.ts:46](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L46)

***

### maxZ

> **maxZ**: `number`

Defined in: [src/scene/SceneAssets.ts:48](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L48)

***

### min

> **min**: `Vector3`

Defined in: [src/scene/SceneAssets.ts:38](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L38)

Canto mínimo (x,y,z) em world space.

***

### minX

> **minX**: `number`

Defined in: [src/scene/SceneAssets.ts:45](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L45)

***

### minZ

> **minZ**: `number`

Defined in: [src/scene/SceneAssets.ts:47](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L47)

***

### size

> **size**: `Vector3`

Defined in: [src/scene/SceneAssets.ts:42](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L42)

Dimensões reais (largura, altura, profundidade).

***

### topY

> **topY**: `number`

Defined in: [src/scene/SceneAssets.ts:50](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L50)

Topo do objeto (= `max.y`) — apoie outra peça aqui pra empilhar.
