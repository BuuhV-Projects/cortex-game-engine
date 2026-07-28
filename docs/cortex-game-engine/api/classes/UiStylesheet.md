[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / UiStylesheet

# Class: UiStylesheet

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/UiStylesheet.ts:30](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiStylesheet.ts#L30)

## Constructors

### Constructor

> **new UiStylesheet**(`rules`): `UiStylesheet`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/UiStylesheet.ts:31](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiStylesheet.ts#L31)

#### Parameters

##### rules

`Map`\<`string`, `StyleProps`\>

#### Returns

`UiStylesheet`

## Methods

### apply()

> **apply**\<`T`\>(`widget`, `className`): `T`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/UiStylesheet.ts:34](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiStylesheet.ts#L34)

Aplica a classe (e `:focus`, se houver) ao widget. Erro se não existir.

#### Type Parameters

##### T

`T` *extends* [`UiWidget`](UiWidget.md)

#### Parameters

##### widget

`T`

##### className

`string`

#### Returns

`T`
