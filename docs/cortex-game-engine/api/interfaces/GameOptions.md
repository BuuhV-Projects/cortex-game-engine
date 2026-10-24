[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / GameOptions

# Interface: GameOptions

Defined in: [src/core/Game.ts:109](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L109)

Opções do [Game](../classes/Game.md).

## Properties

### canvas

> **canvas**: `HTMLCanvasElement`

Defined in: [src/core/Game.ts:111](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L111)

Canvas onde o jogo renderiza.

***

### far?

> `optional` **far?**: `number`

Defined in: [src/core/Game.ts:121](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L121)

Far plane. Default `1000`.

***

### fov?

> `optional` **fov?**: `number`

Defined in: [src/core/Game.ts:117](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L117)

Field of view da câmera perspectiva (graus). Default `60`.

***

### height?

> `optional` **height?**: `number`

Defined in: [src/core/Game.ts:115](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L115)

Altura inicial. Default `window.innerHeight`.

***

### near?

> `optional` **near?**: `number`

Defined in: [src/core/Game.ts:119](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L119)

Near plane. Default `0.1`.

***

### pixelsPerUnit?

> `optional` **pixelsPerUnit?**: `number`

Defined in: [src/core/Game.ts:134](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L134)

Só pra `orthographic`: **pixels de tela por unidade de mundo** (zoom). Ex.:
`100` = 1 unidade ocupa 100px. Um sprite de 16px de altura vira nítido a
`1 unidade` com nearest filter. Default `100`.

***

### projection?

> `optional` **projection?**: `"perspective"` \| `"orthographic"`

Defined in: [src/core/Game.ts:128](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L128)

Projeção da câmera do jogo:
- `perspective` (default) — 3D / 2.5D com profundidade.
- `orthographic` — **2D / pixel art** (sem distorção de perspectiva). Use com
  [GameOptions.pixelsPerUnit](#pixelsperunit) e sprites (ver `createSprite`).

***

### width?

> `optional` **width?**: `number`

Defined in: [src/core/Game.ts:113](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L113)

Largura inicial. Default `window.innerWidth`.
