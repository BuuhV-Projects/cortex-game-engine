[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / showControlsScreen

# Function: showControlsScreen()

> **showControlsScreen**(`game`, `actions`, `options?`): `Promise`\<`void`\>

Defined in: .claude/worktrees/feat-input-rebind/src/input/ControlsScreen.ts:121

Abre a tela de Controles e resolve quando o jogador sai. Persiste os
bindings (se `config` foi passado) antes de resolver.

## Parameters

### game

#### gamepad?

[`GamepadManager`](../classes/GamepadManager.md)

#### ui

[`UiLayer`](../classes/UiLayer.md)

### actions

[`InputActions`](../classes/InputActions.md)

### options?

[`ControlsScreenOptions`](../interfaces/ControlsScreenOptions.md) = `{}`

## Returns

`Promise`\<`void`\>
