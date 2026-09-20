[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / InputActionsOptions

# Interface: InputActionsOptions

Defined in: [src/input/InputActions.ts:48](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/InputActions.ts#L48)

## Properties

### actions?

> `optional` **actions?**: readonly [`ActionDef`](ActionDef.md)[]

Defined in: [src/input/InputActions.ts:50](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/InputActions.ts#L50)

Catálogo inicial. Default: [ENGINE\_ACTIONS](../variables/ENGINE_ACTIONS.md).

***

### padIndex?

> `optional` **padIndex?**: `number`

Defined in: [src/input/InputActions.ts:52](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/input/InputActions.ts#L52)

Slot preferido do gamepad (0..3). Default 0 — com fallback pro 1º conectado.
