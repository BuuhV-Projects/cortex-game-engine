[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / UiPanel

# Class: UiPanel

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/widgets.ts:56](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L56)

Caixa (fundo de HUD, card de menu, faixa de banner). O estilo é um SUBSET
do CSS **com os MESMOS nomes do HTML5** (filosofia DOM-lite: não reinventar
— `background`, `borderRadius`, `boxShadow`...), que os DOIS backends
desenham igual (ADR-0102). Toda cor aceita alpha (`#rrggbbaa`/`rgba(...)`).

## Extends

- [`UiWidget`](UiWidget.md)

## Constructors

### Constructor

> **new UiPanel**(`props?`): `UiPanel`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/widgets.ts:99](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L99)

#### Parameters

##### props?

[`UiWidgetProps`](../interfaces/UiWidgetProps.md) & `Partial`\<`Pick`\<`UiPanel`, `"background"` \| `"backgroundTo"` \| `"cornerRadius"` \| `"borderRadius"` \| `"borderWidth"` \| `"borderColor"` \| `"backgroundImage"` \| `"boxShadow"`\>\> = `{}`

#### Returns

`UiPanel`

#### Overrides

[`UiWidget`](UiWidget.md).[`constructor`](UiWidget.md#constructor)

## Properties

### anchor

> **anchor**: [`UiAnchor`](../type-aliases/UiAnchor.md) = `'top-left'`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/widgets.ts:28](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L28)

#### Inherited from

[`UiWidget`](UiWidget.md).[`anchor`](UiWidget.md#anchor)

***

### background

> **background**: `string` = `'#000000'`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/widgets.ts:62](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L62)

`background` do CSS: cor (`#rrggbb`, `#rrggbbaa`, `rgba(...)`) OU
gradiente `linear-gradient(180deg|90deg, c1, c2)` (180deg = topo→base,
90deg = esquerda→direita — únicos ângulos do subset).

***

### backgroundImage

> **backgroundImage**: `string` \| `null` = `null`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/widgets.ts:91](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L91)

URL de uma **imagem de fundo** (ex.: arte do menu). Cobre o painel
("cover" — preenche sem distorcer, corta o excedente) por cima da
cor/gradiente (que ficam de fallback enquanto a imagem carrega). `null` =
sem imagem. Funciona nos dois backends (DOM: `background-image`; console:
quad texturizado). Atributo `image` no template.

***

### ~~backgroundTo~~

> **backgroundTo**: `string` \| `null` = `null`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/widgets.ts:64](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L64)

#### Deprecated

Use `background: 'linear-gradient(180deg, c1, c2)'` (CSS).

***

### borderColor

> **borderColor**: `string` = `'#ffffff'`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/widgets.ts:77](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L77)

`border-color` do CSS.

***

### borderWidth

> **borderWidth**: `number` = `0`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/widgets.ts:75](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L75)

`border-width` do CSS (px; 0 = sem borda).

***

### boxShadow

> **boxShadow**: `string` = `'none'`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/widgets.ts:83](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L83)

`box-shadow` do CSS, no subset SOMBRA DURA: `"0 Npx 0 <cor>"` (a sombra
chapada dos botões cartoon) ou `"none"`. Sem blur/spread — os dois
backends desenham uma cópia da caixa deslocada N px pra baixo.

***

### cornerRadius

> **cornerRadius**: `number` = `0`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/widgets.ts:66](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L66)

Raio dos cantos em px (0 = reto). Nome legado de [borderRadius](#borderradius).

***

### dirty

> **dirty**: `boolean` = `true`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/widgets.ts:40](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L40)

Sujo = backend precisa re-sincronizar este widget.

#### Inherited from

[`UiWidget`](UiWidget.md).[`dirty`](UiWidget.md#dirty)

***

### fill

> **fill**: `boolean` = `false`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/widgets.ts:98](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L98)

Painel de fundo do tamanho do viewport (atributo `fill` do template). Quando
`true`, o UiLayer redimensiona width/height pro viewport ATUAL a cada frame —
sem isso o painel ficaria travado no tamanho de quando foi criado e não
cobriria a tela após um resize (ex.: entrar em fullscreen).

***

### height

> **height**: `number` = `0`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/widgets.ts:33](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L33)

#### Inherited from

[`UiWidget`](UiWidget.md).[`height`](UiWidget.md#height)

***

### id

> `readonly` **id**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/widgets.ts:27](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L27)

#### Inherited from

[`UiWidget`](UiWidget.md).[`id`](UiWidget.md#id)

***

### measuredHeight

> **measuredHeight**: `number` = `0`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/widgets.ts:38](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L38)

#### Inherited from

[`UiWidget`](UiWidget.md).[`measuredHeight`](UiWidget.md#measuredheight)

***

### measuredWidth

> **measuredWidth**: `number` = `0`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/widgets.ts:37](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L37)

Tamanho MEDIDO pelo backend (texto rasterizado) — leitura.

#### Inherited from

[`UiWidget`](UiWidget.md).[`measuredWidth`](UiWidget.md#measuredwidth)

***

### opacity

> **opacity**: `number` = `1`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/widgets.ts:35](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L35)

#### Inherited from

[`UiWidget`](UiWidget.md).[`opacity`](UiWidget.md#opacity)

***

### visible

> **visible**: `boolean` = `true`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/widgets.ts:34](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L34)

#### Inherited from

[`UiWidget`](UiWidget.md).[`visible`](UiWidget.md#visible)

***

### width

> **width**: `number` = `0`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/widgets.ts:32](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L32)

Tamanho declarado (Panel/Button). Labels medem no backend.

#### Inherited from

[`UiWidget`](UiWidget.md).[`width`](UiWidget.md#width)

***

### x

> **x**: `number` = `0`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/widgets.ts:29](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L29)

#### Inherited from

[`UiWidget`](UiWidget.md).[`x`](UiWidget.md#x)

***

### y

> **y**: `number` = `0`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/widgets.ts:30](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L30)

#### Inherited from

[`UiWidget`](UiWidget.md).[`y`](UiWidget.md#y)

## Accessors

### borderRadius

#### Get Signature

> **get** **borderRadius**(): `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/widgets.ts:68](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L68)

`border-radius` do CSS (px). Alias primário de [cornerRadius](#cornerradius).

##### Returns

`number`

#### Set Signature

> **set** **borderRadius**(`value`): `void`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/widgets.ts:71](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L71)

##### Parameters

###### value

`number`

##### Returns

`void`

## Methods

### set()

> **set**(`props`): `this`

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/widgets.ts:43](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L43)

Aplica props e marca o widget pra re-sincronização.

#### Parameters

##### props

`Partial`\<`this`\>

#### Returns

`this`

#### Inherited from

[`UiWidget`](UiWidget.md).[`set`](UiWidget.md#set)
