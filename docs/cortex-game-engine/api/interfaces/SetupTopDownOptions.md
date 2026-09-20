[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / SetupTopDownOptions

# Interface: SetupTopDownOptions

Defined in: [src/scene/TopDown.ts:11](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/TopDown.ts#L11)

Opções de [setupTopDown](../functions/setupTopDown.md).

## Properties

### camera?

> `optional` **camera?**: [`TopDownCameraOptions`](TopDownCameraOptions.md)

Defined in: [src/scene/TopDown.ts:22](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/TopDown.ts#L22)

Opções da câmera 3/4 (height, angle, responsiveness, bounds…).

***

### move?

> `optional` **move?**: [`TopDownMovementOptions`](TopDownMovementOptions.md)

Defined in: [src/scene/TopDown.ts:20](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/TopDown.ts#L20)

Opções do movimento (moveSpeed).

***

### readMove?

> `optional` **readMove?**: [`MoveAxisProvider`](../type-aliases/MoveAxisProvider.md)

Defined in: [src/scene/TopDown.ts:18](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/TopDown.ts#L18)

**Eixo de movimento** (−1..1) lido do controle do JOGO (teclado/joystick) — o
engine não conhece o esquema de input (ADR-0066). Ex.:
`() => ({ x: meuControle.moveX(), y: meuControle.moveY() })`. Sem isso, o player
não anda.
