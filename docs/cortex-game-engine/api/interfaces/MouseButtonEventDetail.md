[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / MouseButtonEventDetail

# Interface: MouseButtonEventDetail

Defined in: [.claude/worktrees/feat-input-rebind/src/core/InputManager.ts:41](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/InputManager.ts#L41)

Detalhe transportado pelos eventos `mouse:down` e `mouse:up`.

## Properties

### button

> **button**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/InputManager.ts:43](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/InputManager.ts#L43)

Índice do botão: 0 = esquerdo, 1 = meio, 2 = direito.

***

### originalEvent

> **originalEvent**: `MouseEvent`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/InputManager.ts:47](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/InputManager.ts#L47)

Evento DOM original.

***

### position

> **position**: [`MousePosition`](MousePosition.md)

Defined in: [.claude/worktrees/feat-input-rebind/src/core/InputManager.ts:45](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/InputManager.ts#L45)

Posição do mouse no momento do evento, relativa ao elemento.
