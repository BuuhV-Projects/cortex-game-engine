[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / GameOptions

# Interface: GameOptions

Defined in: [src/core/Game.ts:41](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L41)

Opções do [Game](../classes/Game.md).

## Properties

### canvas

> **canvas**: `HTMLCanvasElement`

Defined in: [src/core/Game.ts:43](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L43)

Canvas onde o jogo renderiza.

***

### far?

> `optional` **far?**: `number`

Defined in: [src/core/Game.ts:53](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L53)

Far plane. Default `1000`.

***

### fov?

> `optional` **fov?**: `number`

Defined in: [src/core/Game.ts:49](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L49)

Field of view da câmera perspectiva (graus). Default `60`.

***

### height?

> `optional` **height?**: `number`

Defined in: [src/core/Game.ts:47](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L47)

Altura inicial. Default `window.innerHeight`.

***

### near?

> `optional` **near?**: `number`

Defined in: [src/core/Game.ts:51](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L51)

Near plane. Default `0.1`.

***

### pixelsPerUnit?

> `optional` **pixelsPerUnit?**: `number`

Defined in: [src/core/Game.ts:66](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L66)

Só pra `orthographic`: **pixels de tela por unidade de mundo** (zoom). Ex.:
`100` = 1 unidade ocupa 100px. Um sprite de 16px de altura vira nítido a
`1 unidade` com nearest filter. Default `100`.

***

### projection?

> `optional` **projection?**: `"perspective"` \| `"orthographic"`

Defined in: [src/core/Game.ts:60](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L60)

Projeção da câmera do jogo:
- `perspective` (default) — 3D / 2.5D com profundidade.
- `orthographic` — **2D / pixel art** (sem distorção de perspectiva). Use com
  [GameOptions.pixelsPerUnit](#pixelsperunit) e sprites (ver `createSprite`).

***

### width?

> `optional` **width?**: `number`

Defined in: [src/core/Game.ts:45](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L45)

Largura inicial. Default `window.innerWidth`.
