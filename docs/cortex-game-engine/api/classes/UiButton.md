[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / UiButton

# Class: UiButton

Defined in: src/ui/runtime/widgets.ts:74

Botão focável: Label + fundo + `onPress` (Enter/A com foco).

## Extends

- [`UiLabel`](UiLabel.md)

## Constructors

### Constructor

> **new UiButton**(`props?`): `UiButton`

Defined in: src/ui/runtime/widgets.ts:88

#### Parameters

##### props?

[`UiWidgetProps`](../interfaces/UiWidgetProps.md) & `Partial`\<`Pick`\<`UiButton`, `"color"` \| `"background"` \| `"text"` \| `"fontSize"` \| `"focusBackground"` \| `"paddingX"` \| `"paddingY"` \| `"onPress"` \| `"focusable"`\>\> = `{}`

#### Returns

`UiButton`

#### Overrides

[`UiLabel`](UiLabel.md).[`constructor`](UiLabel.md#constructor)

## Properties

### anchor

> **anchor**: [`UiAnchor`](../type-aliases/UiAnchor.md) = `'top-left'`

Defined in: src/ui/runtime/widgets.ts:28

#### Inherited from

[`UiLabel`](UiLabel.md).[`anchor`](UiLabel.md#anchor)

***

### background

> **background**: `string` = `'#222233'`

Defined in: src/ui/runtime/widgets.ts:75

***

### color

> **color**: `string` = `'#ffffff'`

Defined in: src/ui/runtime/widgets.ts:66

Cor CSS do texto.

#### Inherited from

[`UiLabel`](UiLabel.md).[`color`](UiLabel.md#color)

***

### dirty

> **dirty**: `boolean` = `true`

Defined in: src/ui/runtime/widgets.ts:40

Sujo = backend precisa re-sincronizar este widget.

#### Inherited from

[`UiLabel`](UiLabel.md).[`dirty`](UiLabel.md#dirty)

***

### focusable

> **focusable**: `boolean` = `true`

Defined in: src/ui/runtime/widgets.ts:86

Entra na navegação por d-pad/setas? `false` pra botões acionados só por
clique/atalho (ex.: "Fases" durante o gameplay — senão o A do pulo
ativaria o botão focado).

***

### focusBackground

> **focusBackground**: `string` = `'#5546a8'`

Defined in: src/ui/runtime/widgets.ts:77

Cor do fundo quando focado (navegação por d-pad/setas).

***

### focused

> **focused**: `boolean` = `false`

Defined in: src/ui/runtime/widgets.ts:80

***

### fontSize

> **fontSize**: `number` = `18`

Defined in: src/ui/runtime/widgets.ts:64

Altura da fonte em px.

#### Inherited from

[`UiLabel`](UiLabel.md).[`fontSize`](UiLabel.md#fontsize)

***

### height

> **height**: `number` = `0`

Defined in: src/ui/runtime/widgets.ts:33

#### Inherited from

[`UiLabel`](UiLabel.md).[`height`](UiLabel.md#height)

***

### id

> `readonly` **id**: `number`

Defined in: src/ui/runtime/widgets.ts:27

#### Inherited from

[`UiLabel`](UiLabel.md).[`id`](UiLabel.md#id)

***

### measuredHeight

> **measuredHeight**: `number` = `0`

Defined in: src/ui/runtime/widgets.ts:38

#### Inherited from

[`UiLabel`](UiLabel.md).[`measuredHeight`](UiLabel.md#measuredheight)

***

### measuredWidth

> **measuredWidth**: `number` = `0`

Defined in: src/ui/runtime/widgets.ts:37

Tamanho MEDIDO pelo backend (texto rasterizado) — leitura.

#### Inherited from

[`UiLabel`](UiLabel.md).[`measuredWidth`](UiLabel.md#measuredwidth)

***

### onPress

> **onPress**: (() => `void`) \| `null` = `null`

Defined in: src/ui/runtime/widgets.ts:87

***

### opacity

> **opacity**: `number` = `1`

Defined in: src/ui/runtime/widgets.ts:35

#### Inherited from

[`UiLabel`](UiLabel.md).[`opacity`](UiLabel.md#opacity)

***

### paddingX

> **paddingX**: `number` = `14`

Defined in: src/ui/runtime/widgets.ts:78

***

### paddingY

> **paddingY**: `number` = `8`

Defined in: src/ui/runtime/widgets.ts:79

***

### text

> **text**: `string` = `''`

Defined in: src/ui/runtime/widgets.ts:62

#### Inherited from

[`UiLabel`](UiLabel.md).[`text`](UiLabel.md#text)

***

### visible

> **visible**: `boolean` = `true`

Defined in: src/ui/runtime/widgets.ts:34

#### Inherited from

[`UiLabel`](UiLabel.md).[`visible`](UiLabel.md#visible)

***

### width

> **width**: `number` = `0`

Defined in: src/ui/runtime/widgets.ts:32

Tamanho declarado (Panel/Button). Labels medem no backend.

#### Inherited from

[`UiLabel`](UiLabel.md).[`width`](UiLabel.md#width)

***

### x

> **x**: `number` = `0`

Defined in: src/ui/runtime/widgets.ts:29

#### Inherited from

[`UiLabel`](UiLabel.md).[`x`](UiLabel.md#x)

***

### y

> **y**: `number` = `0`

Defined in: src/ui/runtime/widgets.ts:30

#### Inherited from

[`UiLabel`](UiLabel.md).[`y`](UiLabel.md#y)

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

[`UiLabel`](UiLabel.md).[`set`](UiLabel.md#set)
