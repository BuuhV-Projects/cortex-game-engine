[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / UiLabel

# Class: UiLabel

Defined in: src/ui/runtime/widgets.ts:61

Texto de uma linha (contador, título, banner).

## Extends

- [`UiWidget`](UiWidget.md)

## Extended by

- [`UiButton`](UiButton.md)

## Constructors

### Constructor

> **new UiLabel**(`props?`): `UiLabel`

Defined in: src/ui/runtime/widgets.ts:67

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

Defined in: src/ui/runtime/widgets.ts:28

#### Inherited from

[`UiWidget`](UiWidget.md).[`anchor`](UiWidget.md#anchor)

***

### color

> **color**: `string` = `'#ffffff'`

Defined in: src/ui/runtime/widgets.ts:66

Cor CSS do texto.

***

### dirty

> **dirty**: `boolean` = `true`

Defined in: src/ui/runtime/widgets.ts:40

Sujo = backend precisa re-sincronizar este widget.

#### Inherited from

[`UiWidget`](UiWidget.md).[`dirty`](UiWidget.md#dirty)

***

### fontSize

> **fontSize**: `number` = `18`

Defined in: src/ui/runtime/widgets.ts:64

Altura da fonte em px.

***

### height

> **height**: `number` = `0`

Defined in: src/ui/runtime/widgets.ts:33

#### Inherited from

[`UiWidget`](UiWidget.md).[`height`](UiWidget.md#height)

***

### id

> `readonly` **id**: `number`

Defined in: src/ui/runtime/widgets.ts:27

#### Inherited from

[`UiWidget`](UiWidget.md).[`id`](UiWidget.md#id)

***

### measuredHeight

> **measuredHeight**: `number` = `0`

Defined in: src/ui/runtime/widgets.ts:38

#### Inherited from

[`UiWidget`](UiWidget.md).[`measuredHeight`](UiWidget.md#measuredheight)

***

### measuredWidth

> **measuredWidth**: `number` = `0`

Defined in: src/ui/runtime/widgets.ts:37

Tamanho MEDIDO pelo backend (texto rasterizado) — leitura.

#### Inherited from

[`UiWidget`](UiWidget.md).[`measuredWidth`](UiWidget.md#measuredwidth)

***

### opacity

> **opacity**: `number` = `1`

Defined in: src/ui/runtime/widgets.ts:35

#### Inherited from

[`UiWidget`](UiWidget.md).[`opacity`](UiWidget.md#opacity)

***

### text

> **text**: `string` = `''`

Defined in: src/ui/runtime/widgets.ts:62

***

### visible

> **visible**: `boolean` = `true`

Defined in: src/ui/runtime/widgets.ts:34

#### Inherited from

[`UiWidget`](UiWidget.md).[`visible`](UiWidget.md#visible)

***

### width

> **width**: `number` = `0`

Defined in: src/ui/runtime/widgets.ts:32

Tamanho declarado (Panel/Button). Labels medem no backend.

#### Inherited from

[`UiWidget`](UiWidget.md).[`width`](UiWidget.md#width)

***

### x

> **x**: `number` = `0`

Defined in: src/ui/runtime/widgets.ts:29

#### Inherited from

[`UiWidget`](UiWidget.md).[`x`](UiWidget.md#x)

***

### y

> **y**: `number` = `0`

Defined in: src/ui/runtime/widgets.ts:30

#### Inherited from

[`UiWidget`](UiWidget.md).[`y`](UiWidget.md#y)

## Methods

### set()

> **set**(`props`): `this`

Defined in: src/ui/runtime/widgets.ts:43

Aplica props e marca o widget pra re-sincronização.

#### Parameters

##### props

`Partial`\<`this`\>

#### Returns

`this`

#### Inherited from

[`UiWidget`](UiWidget.md).[`set`](UiWidget.md#set)
