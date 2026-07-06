[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / UiStylesheet

# Class: UiStylesheet

Defined in: [src/ui/runtime/UiStylesheet.ts:26](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiStylesheet.ts#L26)

## Constructors

### Constructor

> **new UiStylesheet**(`rules`): `UiStylesheet`

Defined in: [src/ui/runtime/UiStylesheet.ts:27](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiStylesheet.ts#L27)

#### Parameters

##### rules

`Map`\<`string`, `StyleProps`\>

#### Returns

`UiStylesheet`

## Methods

### apply()

> **apply**\<`T`\>(`widget`, `className`): `T`

Defined in: [src/ui/runtime/UiStylesheet.ts:30](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiStylesheet.ts#L30)

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
