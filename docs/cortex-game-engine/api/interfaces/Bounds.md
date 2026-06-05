[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / Bounds

# Interface: Bounds

Defined in: [src/scene/SceneAssets.ts:22](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L22)

Caixa delimitadora (axis-aligned) de um objeto em **world space**, com os
limites desempacotados em escalares. Use `maxX`/`minX`/`maxZ`/`minZ` pra
conectar peças pela borda real e `topY` pra empilhar algo no topo.

## Properties

### bottomY

> **bottomY**: `number`

Defined in: [src/scene/SceneAssets.ts:38](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L38)

Base do objeto (= `min.y`).

***

### center

> **center**: `Vector3`

Defined in: [src/scene/SceneAssets.ts:30](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L30)

Centro geométrico.

***

### max

> **max**: `Vector3`

Defined in: [src/scene/SceneAssets.ts:26](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L26)

Canto máximo (x,y,z) em world space.

***

### maxX

> **maxX**: `number`

Defined in: [src/scene/SceneAssets.ts:32](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L32)

***

### maxZ

> **maxZ**: `number`

Defined in: [src/scene/SceneAssets.ts:34](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L34)

***

### min

> **min**: `Vector3`

Defined in: [src/scene/SceneAssets.ts:24](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L24)

Canto mínimo (x,y,z) em world space.

***

### minX

> **minX**: `number`

Defined in: [src/scene/SceneAssets.ts:31](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L31)

***

### minZ

> **minZ**: `number`

Defined in: [src/scene/SceneAssets.ts:33](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L33)

***

### size

> **size**: `Vector3`

Defined in: [src/scene/SceneAssets.ts:28](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L28)

Dimensões reais (largura, altura, profundidade).

***

### topY

> **topY**: `number`

Defined in: [src/scene/SceneAssets.ts:36](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L36)

Topo do objeto (= `max.y`) — apoie outra peça aqui pra empilhar.
