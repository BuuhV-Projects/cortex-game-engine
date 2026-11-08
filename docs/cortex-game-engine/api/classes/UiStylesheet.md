[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / UiStylesheet

# Class: UiStylesheet

Defined in: [src/ui/runtime/UiStylesheet.ts:40](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiStylesheet.ts#L40)

## Constructors

### Constructor

> **new UiStylesheet**(`rules`, `fontFaces?`): `UiStylesheet`

Defined in: [src/ui/runtime/UiStylesheet.ts:41](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiStylesheet.ts#L41)

#### Parameters

##### rules

`Map`\<`string`, `StyleProps`\>

##### fontFaces?

readonly [`UiFontFace`](../interfaces/UiFontFace.md)[] = `[]`

`@font-face` declaradas no CSS, na ordem.

#### Returns

`UiStylesheet`

## Properties

### fontFaces

> `readonly` **fontFaces**: readonly [`UiFontFace`](../interfaces/UiFontFace.md)[] = `[]`

Defined in: [src/ui/runtime/UiStylesheet.ts:44](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiStylesheet.ts#L44)

`@font-face` declaradas no CSS, na ordem.

## Methods

### apply()

> **apply**\<`T`\>(`widget`, `className`): `T`

Defined in: [src/ui/runtime/UiStylesheet.ts:48](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/UiStylesheet.ts#L48)

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
