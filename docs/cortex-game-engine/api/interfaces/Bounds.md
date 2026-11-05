[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / Bounds

# Interface: Bounds

Defined in: [src/scene/SceneAssets.ts:35](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L35)

Caixa delimitadora (axis-aligned) de um objeto em **world space**, com os
limites desempacotados em escalares. Use `maxX`/`minX`/`maxZ`/`minZ` pra
conectar peças pela borda real e `topY` pra empilhar algo no topo.

## Properties

### bottomY

> **bottomY**: `number`

Defined in: [src/scene/SceneAssets.ts:51](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L51)

Base do objeto (= `min.y`).

***

### center

> **center**: `Vector3`

Defined in: [src/scene/SceneAssets.ts:43](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L43)

Centro geométrico.

***

### max

> **max**: `Vector3`

Defined in: [src/scene/SceneAssets.ts:39](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L39)

Canto máximo (x,y,z) em world space.

***

### maxX

> **maxX**: `number`

Defined in: [src/scene/SceneAssets.ts:45](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L45)

***

### maxZ

> **maxZ**: `number`

Defined in: [src/scene/SceneAssets.ts:47](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L47)

***

### min

> **min**: `Vector3`

Defined in: [src/scene/SceneAssets.ts:37](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L37)

Canto mínimo (x,y,z) em world space.

***

### minX

> **minX**: `number`

Defined in: [src/scene/SceneAssets.ts:44](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L44)

***

### minZ

> **minZ**: `number`

Defined in: [src/scene/SceneAssets.ts:46](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L46)

***

### size

> **size**: `Vector3`

Defined in: [src/scene/SceneAssets.ts:41](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L41)

Dimensões reais (largura, altura, profundidade).

***

### topY

> **topY**: `number`

Defined in: [src/scene/SceneAssets.ts:49](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L49)

Topo do objeto (= `max.y`) — apoie outra peça aqui pra empilhar.
