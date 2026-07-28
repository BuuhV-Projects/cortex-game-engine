[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / Bounds

# Interface: Bounds

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/SceneAssets.ts:23](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L23)

Caixa delimitadora (axis-aligned) de um objeto em **world space**, com os
limites desempacotados em escalares. Use `maxX`/`minX`/`maxZ`/`minZ` pra
conectar peças pela borda real e `topY` pra empilhar algo no topo.

## Properties

### bottomY

> **bottomY**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/SceneAssets.ts:39](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L39)

Base do objeto (= `min.y`).

***

### center

> **center**: `Vector3`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/SceneAssets.ts:31](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L31)

Centro geométrico.

***

### max

> **max**: `Vector3`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/SceneAssets.ts:27](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L27)

Canto máximo (x,y,z) em world space.

***

### maxX

> **maxX**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/SceneAssets.ts:33](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L33)

***

### maxZ

> **maxZ**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/SceneAssets.ts:35](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L35)

***

### min

> **min**: `Vector3`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/SceneAssets.ts:25](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L25)

Canto mínimo (x,y,z) em world space.

***

### minX

> **minX**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/SceneAssets.ts:32](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L32)

***

### minZ

> **minZ**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/SceneAssets.ts:34](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L34)

***

### size

> **size**: `Vector3`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/SceneAssets.ts:29](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L29)

Dimensões reais (largura, altura, profundidade).

***

### topY

> **topY**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/SceneAssets.ts:37](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L37)

Topo do objeto (= `max.y`) — apoie outra peça aqui pra empilhar.
