[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / GameOptions

# Interface: GameOptions

Defined in: [src/core/Game.ts:63](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L63)

Opções do [Game](../classes/Game.md).

## Properties

### canvas

> **canvas**: `HTMLCanvasElement`

Defined in: [src/core/Game.ts:65](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L65)

Canvas onde o jogo renderiza.

***

### far?

> `optional` **far?**: `number`

Defined in: [src/core/Game.ts:75](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L75)

Far plane. Default `1000`.

***

### fov?

> `optional` **fov?**: `number`

Defined in: [src/core/Game.ts:71](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L71)

Field of view da câmera perspectiva (graus). Default `60`.

***

### height?

> `optional` **height?**: `number`

Defined in: [src/core/Game.ts:69](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L69)

Altura inicial. Default `window.innerHeight`.

***

### near?

> `optional` **near?**: `number`

Defined in: [src/core/Game.ts:73](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L73)

Near plane. Default `0.1`.

***

### pixelsPerUnit?

> `optional` **pixelsPerUnit?**: `number`

Defined in: [src/core/Game.ts:88](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L88)

Só pra `orthographic`: **pixels de tela por unidade de mundo** (zoom). Ex.:
`100` = 1 unidade ocupa 100px. Um sprite de 16px de altura vira nítido a
`1 unidade` com nearest filter. Default `100`.

***

### projection?

> `optional` **projection?**: `"perspective"` \| `"orthographic"`

Defined in: [src/core/Game.ts:82](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L82)

Projeção da câmera do jogo:
- `perspective` (default) — 3D / 2.5D com profundidade.
- `orthographic` — **2D / pixel art** (sem distorção de perspectiva). Use com
  [GameOptions.pixelsPerUnit](#pixelsperunit) e sprites (ver `createSprite`).

***

### width?

> `optional` **width?**: `number`

Defined in: [src/core/Game.ts:67](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L67)

Largura inicial. Default `window.innerWidth`.
