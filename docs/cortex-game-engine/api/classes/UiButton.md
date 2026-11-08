[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / UiButton

# Class: UiButton

Defined in: [src/ui/runtime/widgets.ts:142](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L142)

Botão focável: Label + fundo + `onPress` (Enter/A com foco).

## Extends

- [`UiLabel`](UiLabel.md)

## Constructors

### Constructor

> **new UiButton**(`props?`): `UiButton`

Defined in: [src/ui/runtime/widgets.ts:178](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L178)

#### Parameters

##### props?

[`UiWidgetProps`](../interfaces/UiWidgetProps.md) & `Partial`\<`Pick`\<`UiButton`, `"color"` \| `"borderColor"` \| `"borderWidth"` \| `"background"` \| `"cornerRadius"` \| `"borderRadius"` \| `"boxShadow"` \| `"text"` \| `"fontSize"` \| `"fontFamily"` \| `"focusBackground"` \| `"focusBorderWidth"` \| `"focusBorderColor"` \| `"textAlign"` \| `"paddingX"` \| `"paddingY"` \| `"onPress"` \| `"focusable"`\>\> = `{}`

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

Defined in: [src/ui/runtime/widgets.ts:144](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L144)

`background` do CSS: cor OU `linear-gradient(180deg, c1, c2)`.

***

### borderColor

> **borderColor**: `string` = `'#ffffff'`

Defined in: [src/ui/runtime/widgets.ts:159](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L159)

`border-color` do CSS (borda constante).

***

### borderWidth

> **borderWidth**: `number` = `0`

Defined in: [src/ui/runtime/widgets.ts:157](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L157)

`border-width` do CSS — borda CONSTANTE (moldura dos botões cartoon). 0 = sem.

***

### boxShadow

> **boxShadow**: `string` = `'none'`

Defined in: [src/ui/runtime/widgets.ts:165](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L165)

`box-shadow` do CSS (subset `"0 Npx 0 <cor>"` — sombra dura) ou `"none"`.

***

### color

> **color**: `string` = `'#ffffff'`

Defined in: [src/ui/runtime/widgets.ts:126](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L126)

Cor CSS do texto.

#### Inherited from

[`UiLabel`](UiLabel.md).[`color`](UiLabel.md#color)

***

### cornerRadius

> **cornerRadius**: `number` = `10`

Defined in: [src/ui/runtime/widgets.ts:148](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L148)

Raio dos cantos em px. Nome legado de [borderRadius](#borderradius).

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

Defined in: [src/ui/runtime/widgets.ts:176](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L176)

Entra na navegação por d-pad/setas? `false` pra botões acionados só por
clique/atalho (ex.: "Fases" durante o gameplay — senão o A do pulo
ativaria o botão focado).

***

### focusBackground

> **focusBackground**: `string` = `'#5546a8'`

Defined in: [src/ui/runtime/widgets.ts:146](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L146)

Fundo quando focado (o `:focus` do CSS): cor ou gradiente.

***

### focusBorderColor

> **focusBorderColor**: `string` = `'#ffd94d'`

Defined in: [src/ui/runtime/widgets.ts:163](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L163)

Cor da borda de foco.

***

### focusBorderWidth

> **focusBorderWidth**: `number` = `0`

Defined in: [src/ui/runtime/widgets.ts:161](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L161)

Borda quando FOCADO (destaque de seleção; vence a constante). 0 = sem.

***

### focused

> **focused**: `boolean` = `false`

Defined in: [src/ui/runtime/widgets.ts:170](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L170)

***

### fontFamily

> **fontFamily**: `string` \| `null` = `null`

Defined in: [src/ui/runtime/widgets.ts:132](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L132)

`font-family` do CSS: família registrada por `loadUiFont` (ou `@font-face`
no template). `null` = Roboto Medium da UI. Família não registrada também
cai na Roboto. ADR-0715.

#### Inherited from

[`UiLabel`](UiLabel.md).[`fontFamily`](UiLabel.md#fontfamily)

***

### fontSize

> **fontSize**: `number` = `18`

Defined in: [src/ui/runtime/widgets.ts:124](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L124)

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

Defined in: [src/ui/runtime/widgets.ts:177](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L177)

***

### opacity

> **opacity**: `number` = `1`

Defined in: [src/ui/runtime/widgets.ts:35](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L35)

#### Inherited from

[`UiLabel`](UiLabel.md).[`opacity`](UiLabel.md#opacity)

***

### paddingX

> **paddingX**: `number` = `14`

Defined in: [src/ui/runtime/widgets.ts:168](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L168)

***

### paddingY

> **paddingY**: `number` = `8`

Defined in: [src/ui/runtime/widgets.ts:169](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L169)

***

### text

> **text**: `string` = `''`

Defined in: [src/ui/runtime/widgets.ts:122](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L122)

#### Inherited from

[`UiLabel`](UiLabel.md).[`text`](UiLabel.md#text)

***

### textAlign

> **textAlign**: `"center"` \| `"left"` \| `"right"` = `'center'`

Defined in: [src/ui/runtime/widgets.ts:167](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L167)

`text-align` do CSS dentro do botão (`left`/`right` respeitam `paddingX`).

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

## Accessors

### borderRadius

#### Get Signature

> **get** **borderRadius**(): `number`

Defined in: [src/ui/runtime/widgets.ts:150](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L150)

`border-radius` do CSS (px). Alias primário de [cornerRadius](#cornerradius).

##### Returns

`number`

#### Set Signature

> **set** **borderRadius**(`value`): `void`

Defined in: [src/ui/runtime/widgets.ts:153](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L153)

##### Parameters

###### value

`number`

##### Returns

`void`

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
