[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / GameOptions

# Interface: GameOptions

Defined in: [src/core/Game.ts:108](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L108)

Opções do [Game](../classes/Game.md).

## Properties

### canvas

> **canvas**: `HTMLCanvasElement`

Defined in: [src/core/Game.ts:110](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L110)

Canvas onde o jogo renderiza.

***

### far?

> `optional` **far?**: `number`

Defined in: [src/core/Game.ts:120](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L120)

Far plane. Default `1000`.

***

### fov?

> `optional` **fov?**: `number`

Defined in: [src/core/Game.ts:116](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L116)

Field of view da câmera perspectiva (graus). Default `60`.

***

### height?

> `optional` **height?**: `number`

Defined in: [src/core/Game.ts:114](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L114)

Altura inicial. Default `window.innerHeight`.

***

### near?

> `optional` **near?**: `number`

Defined in: [src/core/Game.ts:118](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L118)

Near plane. Default `0.1`.

***

### pixelsPerUnit?

> `optional` **pixelsPerUnit?**: `number`

Defined in: [src/core/Game.ts:133](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L133)

Só pra `orthographic`: **pixels de tela por unidade de mundo** (zoom). Ex.:
`100` = 1 unidade ocupa 100px. Um sprite de 16px de altura vira nítido a
`1 unidade` com nearest filter. Default `100`.

***

### projection?

> `optional` **projection?**: `"perspective"` \| `"orthographic"`

Defined in: [src/core/Game.ts:127](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L127)

Projeção da câmera do jogo:
- `perspective` (default) — 3D / 2.5D com profundidade.
- `orthographic` — **2D / pixel art** (sem distorção de perspectiva). Use com
  [GameOptions.pixelsPerUnit](#pixelsperunit) e sprites (ver `createSprite`).

***

### width?

> `optional` **width?**: `number`

Defined in: [src/core/Game.ts:112](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L112)

Largura inicial. Default `window.innerWidth`.
