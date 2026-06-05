[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / Bounds

# Interface: Bounds

Defined in: src/scene/SceneAssets.ts:22

Caixa delimitadora (axis-aligned) de um objeto em **world space**, com os
limites desempacotados em escalares. Use `maxX`/`minX`/`maxZ`/`minZ` pra
conectar peças pela borda real e `topY` pra empilhar algo no topo.

## Properties

### bottomY

> **bottomY**: `number`

Defined in: src/scene/SceneAssets.ts:38

Base do objeto (= `min.y`).

***

### center

> **center**: `Vector3`

Defined in: src/scene/SceneAssets.ts:30

Centro geométrico.

***

### max

> **max**: `Vector3`

Defined in: src/scene/SceneAssets.ts:26

Canto máximo (x,y,z) em world space.

***

### maxX

> **maxX**: `number`

Defined in: src/scene/SceneAssets.ts:32

***

### maxZ

> **maxZ**: `number`

Defined in: src/scene/SceneAssets.ts:34

***

### min

> **min**: `Vector3`

Defined in: src/scene/SceneAssets.ts:24

Canto mínimo (x,y,z) em world space.

***

### minX

> **minX**: `number`

Defined in: src/scene/SceneAssets.ts:31

***

### minZ

> **minZ**: `number`

Defined in: src/scene/SceneAssets.ts:33

***

### size

> **size**: `Vector3`

Defined in: src/scene/SceneAssets.ts:28

Dimensões reais (largura, altura, profundidade).

***

### topY

> **topY**: `number`

Defined in: src/scene/SceneAssets.ts:36

Topo do objeto (= `max.y`) — apoie outra peça aqui pra empilhar.
