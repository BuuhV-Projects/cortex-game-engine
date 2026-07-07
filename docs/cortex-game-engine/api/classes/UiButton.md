[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / UiButton

# Class: UiButton

Defined in: [src/ui/runtime/widgets.ts:106](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L106)

Botão focável: Label + fundo + `onPress` (Enter/A com foco).

## Extends

- [`UiLabel`](UiLabel.md)

## Constructors

### Constructor

> **new UiButton**(`props?`): `UiButton`

Defined in: [src/ui/runtime/widgets.ts:126](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L126)

#### Parameters

##### props?

[`UiWidgetProps`](../interfaces/UiWidgetProps.md) & `Partial`\<`Pick`\<`UiButton`, `"color"` \| `"background"` \| `"cornerRadius"` \| `"text"` \| `"fontSize"` \| `"focusBackground"` \| `"focusBorderWidth"` \| `"focusBorderColor"` \| `"paddingX"` \| `"paddingY"` \| `"onPress"` \| `"focusable"`\>\> = `{}`

#### Returns

`UiButton`

#### Overrides

[`UiLabel`](UiLabel.md).[`constructor`](UiLabel.md#constructor)

## Properties

### anchor

> **anchor**: [`UiAnchor`](../type-aliases/UiAnchor.md) = `'top-left'`

Defined in: [src/ui/runtime/widgets.ts:28](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L28)

#### Inherited from

[`UiLabel`](UiLabel.md).[`anchor`](UiLabel.md#anchor)

***

### background

> **background**: `string` = `'#222233'`

Defined in: [src/ui/runtime/widgets.ts:107](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L107)

***

### color

> **color**: `string` = `'#ffffff'`

Defined in: [src/ui/runtime/widgets.ts:98](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L98)

Cor CSS do texto.

#### Inherited from

[`UiLabel`](UiLabel.md).[`color`](UiLabel.md#color)

***

### cornerRadius

> **cornerRadius**: `number` = `10`

Defined in: [src/ui/runtime/widgets.ts:111](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L111)

Raio dos cantos em px.

***

### dirty

> **dirty**: `boolean` = `true`

Defined in: [src/ui/runtime/widgets.ts:40](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L40)

Sujo = backend precisa re-sincronizar este widget.

#### Inherited from

[`UiLabel`](UiLabel.md).[`dirty`](UiLabel.md#dirty)

***

### focusable

> **focusable**: `boolean` = `true`

Defined in: [src/ui/runtime/widgets.ts:124](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L124)

Entra na navegação por d-pad/setas? `false` pra botões acionados só por
clique/atalho (ex.: "Fases" durante o gameplay — senão o A do pulo
ativaria o botão focado).

***

### focusBackground

> **focusBackground**: `string` = `'#5546a8'`

Defined in: [src/ui/runtime/widgets.ts:109](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L109)

Cor do fundo quando focado (navegação por d-pad/setas).

***

### focusBorderColor

> **focusBorderColor**: `string` = `'#ffd94d'`

Defined in: [src/ui/runtime/widgets.ts:115](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L115)

Cor da borda de foco.

***

### focusBorderWidth

> **focusBorderWidth**: `number` = `0`

Defined in: [src/ui/runtime/widgets.ts:113](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L113)

Borda quando FOCADO (destaque de seleção). 0 = sem.

***

### focused

> **focused**: `boolean` = `false`

Defined in: [src/ui/runtime/widgets.ts:118](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L118)

***

### fontSize

> **fontSize**: `number` = `18`

Defined in: [src/ui/runtime/widgets.ts:96](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L96)

Altura da fonte em px.

#### Inherited from

[`UiLabel`](UiLabel.md).[`fontSize`](UiLabel.md#fontsize)

***

### height

> **height**: `number` = `0`

Defined in: [src/ui/runtime/widgets.ts:33](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L33)

#### Inherited from

[`UiLabel`](UiLabel.md).[`height`](UiLabel.md#height)

***

### id

> `readonly` **id**: `number`

Defined in: [src/ui/runtime/widgets.ts:27](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L27)

#### Inherited from

[`UiLabel`](UiLabel.md).[`id`](UiLabel.md#id)

***

### measuredHeight

> **measuredHeight**: `number` = `0`

Defined in: [src/ui/runtime/widgets.ts:38](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L38)

#### Inherited from

[`UiLabel`](UiLabel.md).[`measuredHeight`](UiLabel.md#measuredheight)

***

### measuredWidth

> **measuredWidth**: `number` = `0`

Defined in: [src/ui/runtime/widgets.ts:37](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L37)

Tamanho MEDIDO pelo backend (texto rasterizado) — leitura.

#### Inherited from

[`UiLabel`](UiLabel.md).[`measuredWidth`](UiLabel.md#measuredwidth)

***

### onPress

> **onPress**: (() => `void`) \| `null` = `null`

Defined in: [src/ui/runtime/widgets.ts:125](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L125)

***

### opacity

> **opacity**: `number` = `1`

Defined in: [src/ui/runtime/widgets.ts:35](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L35)

#### Inherited from

[`UiLabel`](UiLabel.md).[`opacity`](UiLabel.md#opacity)

***

### paddingX

> **paddingX**: `number` = `14`

Defined in: [src/ui/runtime/widgets.ts:116](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L116)

***

### paddingY

> **paddingY**: `number` = `8`

Defined in: [src/ui/runtime/widgets.ts:117](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L117)

***

### text

> **text**: `string` = `''`

Defined in: [src/ui/runtime/widgets.ts:94](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L94)

#### Inherited from

[`UiLabel`](UiLabel.md).[`text`](UiLabel.md#text)

***

### visible

> **visible**: `boolean` = `true`

Defined in: [src/ui/runtime/widgets.ts:34](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L34)

#### Inherited from

[`UiLabel`](UiLabel.md).[`visible`](UiLabel.md#visible)

***

### width

> **width**: `number` = `0`

Defined in: [src/ui/runtime/widgets.ts:32](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L32)

Tamanho declarado (Panel/Button). Labels medem no backend.

#### Inherited from

[`UiLabel`](UiLabel.md).[`width`](UiLabel.md#width)

***

### x

> **x**: `number` = `0`

Defined in: [src/ui/runtime/widgets.ts:29](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L29)

#### Inherited from

[`UiLabel`](UiLabel.md).[`x`](UiLabel.md#x)

***

### y

> **y**: `number` = `0`

Defined in: [src/ui/runtime/widgets.ts:30](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L30)

#### Inherited from

[`UiLabel`](UiLabel.md).[`y`](UiLabel.md#y)

## Methods

### set()

> **set**(`props`): `this`

Defined in: [src/ui/runtime/widgets.ts:43](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L43)

Aplica props e marca o widget pra re-sincronização.

#### Parameters

##### props

`Partial`\<`this`\>

#### Returns

`this`

#### Inherited from

[`UiLabel`](UiLabel.md).[`set`](UiLabel.md#set)
