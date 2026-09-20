[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / GameOptions

# Interface: GameOptions

Defined in: [.claude/worktrees/perf-boot-nativo/src/core/Game.ts:64](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L64)

Opções do [Game](../classes/Game.md).

## Properties

### canvas

> **canvas**: `HTMLCanvasElement`

Defined in: [.claude/worktrees/perf-boot-nativo/src/core/Game.ts:66](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L66)

Canvas onde o jogo renderiza.

***

### far?

> `optional` **far?**: `number`

Defined in: [.claude/worktrees/perf-boot-nativo/src/core/Game.ts:76](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L76)

Far plane. Default `1000`.

***

### fov?

> `optional` **fov?**: `number`

Defined in: [.claude/worktrees/perf-boot-nativo/src/core/Game.ts:72](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L72)

Field of view da câmera perspectiva (graus). Default `60`.

***

### height?

> `optional` **height?**: `number`

Defined in: [.claude/worktrees/perf-boot-nativo/src/core/Game.ts:70](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L70)

Altura inicial. Default `window.innerHeight`.

***

### near?

> `optional` **near?**: `number`

Defined in: [.claude/worktrees/perf-boot-nativo/src/core/Game.ts:74](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L74)

Near plane. Default `0.1`.

***

### pixelsPerUnit?

> `optional` **pixelsPerUnit?**: `number`

Defined in: [.claude/worktrees/perf-boot-nativo/src/core/Game.ts:89](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L89)

Só pra `orthographic`: **pixels de tela por unidade de mundo** (zoom). Ex.:
`100` = 1 unidade ocupa 100px. Um sprite de 16px de altura vira nítido a
`1 unidade` com nearest filter. Default `100`.

***

### projection?

> `optional` **projection?**: `"perspective"` \| `"orthographic"`

Defined in: [.claude/worktrees/perf-boot-nativo/src/core/Game.ts:83](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L83)

Projeção da câmera do jogo:
- `perspective` (default) — 3D / 2.5D com profundidade.
- `orthographic` — **2D / pixel art** (sem distorção de perspectiva). Use com
  [GameOptions.pixelsPerUnit](#pixelsperunit) e sprites (ver `createSprite`).

***

### width?

> `optional` **width?**: `number`

Defined in: [.claude/worktrees/perf-boot-nativo/src/core/Game.ts:68](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L68)

Largura inicial. Default `window.innerWidth`.
