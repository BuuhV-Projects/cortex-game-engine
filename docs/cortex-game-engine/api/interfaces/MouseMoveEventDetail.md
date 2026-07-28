[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / MouseMoveEventDetail

# Interface: MouseMoveEventDetail

Defined in: [src/core/InputManager.ts:51](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/InputManager.ts#L51)

Detalhe transportado pelo evento `mouse:move`.

## Properties

### delta

> **delta**: [`MouseDelta`](MouseDelta.md)

Defined in: [src/core/InputManager.ts:58](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/InputManager.ts#L58)

Delta de movimento **desta** ocorrência de `mousemove`
(equivale a `movementX/Y` do evento DOM).

***

### originalEvent

> **originalEvent**: `MouseEvent`

Defined in: [src/core/InputManager.ts:60](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/InputManager.ts#L60)

Evento DOM original.

***

### position

> **position**: [`MousePosition`](MousePosition.md)

Defined in: [src/core/InputManager.ts:53](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/InputManager.ts#L53)

Posição atual do mouse relativa ao elemento.
