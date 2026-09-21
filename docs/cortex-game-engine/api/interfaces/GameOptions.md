[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / GameOptions

# Interface: GameOptions

Defined in: [src/core/Game.ts:75](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L75)

Opções do [Game](../classes/Game.md).

## Properties

### canvas

> **canvas**: `HTMLCanvasElement`

Defined in: [src/core/Game.ts:77](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L77)

Canvas onde o jogo renderiza.

***

### far?

> `optional` **far?**: `number`

Defined in: [src/core/Game.ts:87](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L87)

Far plane. Default `1000`.

***

### fov?

> `optional` **fov?**: `number`

Defined in: [src/core/Game.ts:83](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L83)

Field of view da câmera perspectiva (graus). Default `60`.

***

### height?

> `optional` **height?**: `number`

Defined in: [src/core/Game.ts:81](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L81)

Altura inicial. Default `window.innerHeight`.

***

### near?

> `optional` **near?**: `number`

Defined in: [src/core/Game.ts:85](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L85)

Near plane. Default `0.1`.

***

### pixelsPerUnit?

> `optional` **pixelsPerUnit?**: `number`

Defined in: [src/core/Game.ts:100](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L100)

Só pra `orthographic`: **pixels de tela por unidade de mundo** (zoom). Ex.:
`100` = 1 unidade ocupa 100px. Um sprite de 16px de altura vira nítido a
`1 unidade` com nearest filter. Default `100`.

***

### projection?

> `optional` **projection?**: `"perspective"` \| `"orthographic"`

Defined in: [src/core/Game.ts:94](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L94)

Projeção da câmera do jogo:
- `perspective` (default) — 3D / 2.5D com profundidade.
- `orthographic` — **2D / pixel art** (sem distorção de perspectiva). Use com
  [GameOptions.pixelsPerUnit](#pixelsperunit) e sprites (ver `createSprite`).

***

### width?

> `optional` **width?**: `number`

Defined in: [src/core/Game.ts:79](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L79)

Largura inicial. Default `window.innerWidth`.
