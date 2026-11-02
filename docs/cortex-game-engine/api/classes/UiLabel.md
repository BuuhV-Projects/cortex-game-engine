[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / UiLabel

# Class: UiLabel

Defined in: [src/ui/runtime/widgets.ts:121](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L121)

Texto de uma linha (contador, título, banner).

## Extends

- [`UiWidget`](UiWidget.md)

## Extended by

- [`UiButton`](UiButton.md)

## Constructors

### Constructor

> **new UiLabel**(`props?`): `UiLabel`

Defined in: [src/ui/runtime/widgets.ts:127](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L127)

#### Parameters

##### props?

[`UiWidgetProps`](../interfaces/UiWidgetProps.md) & `Partial`\<`Pick`\<`UiLabel`, `"color"` \| `"text"` \| `"fontSize"`\>\> = `{}`

#### Returns

`UiLabel`

#### Overrides

[`UiWidget`](UiWidget.md).[`constructor`](UiWidget.md#constructor)

## Properties

### anchor

> **anchor**: [`UiAnchor`](../type-aliases/UiAnchor.md) = `'top-left'`

Defined in: [src/ui/runtime/widgets.ts:28](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L28)

#### Inherited from

[`UiWidget`](UiWidget.md).[`anchor`](UiWidget.md#anchor)

***

### color

> **color**: `string` = `'#ffffff'`

Defined in: [src/ui/runtime/widgets.ts:126](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L126)

Cor CSS do texto.

***

### dirty

> **dirty**: `boolean` = `true`

Defined in: [src/ui/runtime/widgets.ts:40](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L40)

Sujo = backend precisa re-sincronizar este widget.

#### Inherited from

[`UiWidget`](UiWidget.md).[`dirty`](UiWidget.md#dirty)

***

### fontSize

> **fontSize**: `number` = `18`

Defined in: [src/ui/runtime/widgets.ts:124](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L124)

Altura da fonte em px.

***

### height

> **height**: `number` = `0`

Defined in: [src/ui/runtime/widgets.ts:33](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L33)

#### Inherited from

[`UiWidget`](UiWidget.md).[`height`](UiWidget.md#height)

***

### id

> `readonly` **id**: `number`

Defined in: [src/ui/runtime/widgets.ts:27](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L27)

#### Inherited from

[`UiWidget`](UiWidget.md).[`id`](UiWidget.md#id)

***

### measuredHeight

> **measuredHeight**: `number` = `0`

Defined in: [src/ui/runtime/widgets.ts:38](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L38)

#### Inherited from

[`UiWidget`](UiWidget.md).[`measuredHeight`](UiWidget.md#measuredheight)

***

### measuredWidth

> **measuredWidth**: `number` = `0`

Defined in: [src/ui/runtime/widgets.ts:37](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L37)

Tamanho MEDIDO pelo backend (texto rasterizado) — leitura.

#### Inherited from

[`UiWidget`](UiWidget.md).[`measuredWidth`](UiWidget.md#measuredwidth)

***

### opacity

> **opacity**: `number` = `1`

Defined in: [src/ui/runtime/widgets.ts:35](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L35)

#### Inherited from

[`UiWidget`](UiWidget.md).[`opacity`](UiWidget.md#opacity)

***

### text

> **text**: `string` = `''`

Defined in: [src/ui/runtime/widgets.ts:122](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L122)

***

### visible

> **visible**: `boolean` = `true`

Defined in: [src/ui/runtime/widgets.ts:34](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L34)

#### Inherited from

[`UiWidget`](UiWidget.md).[`visible`](UiWidget.md#visible)

***

### width

> **width**: `number` = `0`

Defined in: [src/ui/runtime/widgets.ts:32](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L32)

Tamanho declarado (Panel/Button). Labels medem no backend.

#### Inherited from

[`UiWidget`](UiWidget.md).[`width`](UiWidget.md#width)

***

### x

> **x**: `number` = `0`

Defined in: [src/ui/runtime/widgets.ts:29](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L29)

#### Inherited from

[`UiWidget`](UiWidget.md).[`x`](UiWidget.md#x)

***

### y

> **y**: `number` = `0`

Defined in: [src/ui/runtime/widgets.ts:30](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L30)

#### Inherited from

[`UiWidget`](UiWidget.md).[`y`](UiWidget.md#y)

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

[`UiWidget`](UiWidget.md).[`set`](UiWidget.md#set)
