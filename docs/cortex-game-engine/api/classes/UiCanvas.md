[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / UiCanvas

# Class: UiCanvas

Defined in: [src/ui/runtime/widgets.ts:216](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L216)

`<canvas>` da UI de runtime (ADR-0316): dono de um `HTMLCanvasElement` real
onde o jogo desenha com `getContext('2d')` — radar, minimapa, minigame. No
browser o backend DOM põe o PRÓPRIO elemento na tela; no host nativo o
backend renderer sobe os pixels pra uma textura sempre que o canvas muda.

`width`/`height` do widget = tamanho EXIBIDO (0 = o do bitmap); o bitmap é o
`canvas.width/height` (atributos `width`/`height` do template). O bitmap é
esticado pro tamanho exibido (`object-fit: fill`, como no HTML5) dentro da
borda. Fundo default `transparent`, como o canvas do HTML5.

## Example

```ts
const hud = await loadUiTemplate(game.ui, 'assets/ui/hud.html');
const g = (hud.get('radar') as UiCanvas).canvas.getContext('2d')!;
g.fillRect(0, 0, 10, 10); // aparece no Studio e no export nativo
```

## Extends

- [`UiPanel`](UiPanel.md)

## Constructors

### Constructor

> **new UiCanvas**(`props?`): `UiCanvas`

Defined in: [src/ui/runtime/widgets.ts:221](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L221)

#### Parameters

##### props?

[`UiWidgetProps`](../interfaces/UiWidgetProps.md) & `Partial`\<`Pick`\<`UiCanvas`, `"background"` \| `"cornerRadius"` \| `"borderWidth"` \| `"borderColor"` \| `"boxShadow"` \| `"pointerEvents"`\>\> & `object` = `{}`

#### Returns

`UiCanvas`

#### Overrides

[`UiPanel`](UiPanel.md).[`constructor`](UiPanel.md#constructor)

## Properties

### anchor

> **anchor**: [`UiAnchor`](../type-aliases/UiAnchor.md) = `'top-left'`

Defined in: [src/ui/runtime/widgets.ts:28](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L28)

#### Inherited from

[`UiPanel`](UiPanel.md).[`anchor`](UiPanel.md#anchor)

***

### background

> **background**: `string` = `'#000000'`

Defined in: [src/ui/runtime/widgets.ts:62](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L62)

`background` do CSS: cor (`#rrggbb`, `#rrggbbaa`, `rgba(...)`) OU
gradiente `linear-gradient(180deg|90deg, c1, c2)` (180deg = topo→base,
90deg = esquerda→direita — únicos ângulos do subset).

#### Inherited from

[`UiPanel`](UiPanel.md).[`background`](UiPanel.md#background)

***

### backgroundImage

> **backgroundImage**: `string` \| `null` = `null`

Defined in: [src/ui/runtime/widgets.ts:91](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L91)

URL de uma **imagem de fundo** (ex.: arte do menu). Cobre o painel
("cover" — preenche sem distorcer, corta o excedente) por cima da
cor/gradiente (que ficam de fallback enquanto a imagem carrega). `null` =
sem imagem. Funciona nos dois backends (DOM: `background-image`; console:
quad texturizado). Atributo `image` no template.

#### Inherited from

[`UiPanel`](UiPanel.md).[`backgroundImage`](UiPanel.md#backgroundimage)

***

### ~~backgroundTo~~

> **backgroundTo**: `string` \| `null` = `null`

Defined in: [src/ui/runtime/widgets.ts:64](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L64)

#### Deprecated

Use `background: 'linear-gradient(180deg, c1, c2)'` (CSS).

#### Inherited from

[`UiPanel`](UiPanel.md).[`backgroundTo`](UiPanel.md#backgroundto)

***

### borderColor

> **borderColor**: `string` = `'#ffffff'`

Defined in: [src/ui/runtime/widgets.ts:77](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L77)

`border-color` do CSS.

#### Inherited from

[`UiPanel`](UiPanel.md).[`borderColor`](UiPanel.md#bordercolor)

***

### borderWidth

> **borderWidth**: `number` = `0`

Defined in: [src/ui/runtime/widgets.ts:75](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L75)

`border-width` do CSS (px; 0 = sem borda).

#### Inherited from

[`UiPanel`](UiPanel.md).[`borderWidth`](UiPanel.md#borderwidth)

***

### boxShadow

> **boxShadow**: `string` = `'none'`

Defined in: [src/ui/runtime/widgets.ts:83](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L83)

`box-shadow` do CSS, no subset SOMBRA DURA: `"0 Npx 0 <cor>"` (a sombra
chapada dos botões cartoon) ou `"none"`. Sem blur/spread — os dois
backends desenham uma cópia da caixa deslocada N px pra baixo.

#### Inherited from

[`UiPanel`](UiPanel.md).[`boxShadow`](UiPanel.md#boxshadow)

***

### canvas

> `readonly` **canvas**: `HTMLCanvasElement`

Defined in: [src/ui/runtime/widgets.ts:218](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L218)

O elemento canvas (desenhe nele como no browser).

***

### cornerRadius

> **cornerRadius**: `number` = `0`

Defined in: [src/ui/runtime/widgets.ts:66](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L66)

Raio dos cantos em px (0 = reto). Nome legado de [borderRadius](UiPanel.md#borderradius).

#### Inherited from

[`UiPanel`](UiPanel.md).[`cornerRadius`](UiPanel.md#cornerradius)

***

### dirty

> **dirty**: `boolean` = `true`

Defined in: [src/ui/runtime/widgets.ts:40](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L40)

Sujo = backend precisa re-sincronizar este widget.

#### Inherited from

[`UiPanel`](UiPanel.md).[`dirty`](UiPanel.md#dirty)

***

### fill

> **fill**: `boolean` = `false`

Defined in: [src/ui/runtime/widgets.ts:98](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L98)

Painel de fundo do tamanho do viewport (atributo `fill` do template). Quando
`true`, o UiLayer redimensiona width/height pro viewport ATUAL a cada frame —
sem isso o painel ficaria travado no tamanho de quando foi criado e não
cobriria a tela após um resize (ex.: entrar em fullscreen).

#### Inherited from

[`UiPanel`](UiPanel.md).[`fill`](UiPanel.md#fill)

***

### height

> **height**: `number` = `0`

Defined in: [src/ui/runtime/widgets.ts:33](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L33)

#### Inherited from

[`UiPanel`](UiPanel.md).[`height`](UiPanel.md#height)

***

### id

> `readonly` **id**: `number`

Defined in: [src/ui/runtime/widgets.ts:27](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L27)

#### Inherited from

[`UiPanel`](UiPanel.md).[`id`](UiPanel.md#id)

***

### measuredHeight

> **measuredHeight**: `number` = `0`

Defined in: [src/ui/runtime/widgets.ts:38](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L38)

#### Inherited from

[`UiPanel`](UiPanel.md).[`measuredHeight`](UiPanel.md#measuredheight)

***

### measuredWidth

> **measuredWidth**: `number` = `0`

Defined in: [src/ui/runtime/widgets.ts:37](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L37)

Tamanho MEDIDO pelo backend (texto rasterizado) — leitura.

#### Inherited from

[`UiPanel`](UiPanel.md).[`measuredWidth`](UiPanel.md#measuredwidth)

***

### opacity

> **opacity**: `number` = `1`

Defined in: [src/ui/runtime/widgets.ts:35](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L35)

#### Inherited from

[`UiPanel`](UiPanel.md).[`opacity`](UiPanel.md#opacity)

***

### pointerEvents

> **pointerEvents**: `"none"` \| `"auto"` = `'auto'`

Defined in: [src/ui/runtime/widgets.ts:220](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L220)

`pointer-events` do CSS: `none` deixa o clique passar pro jogo (só no DOM).

***

### visible

> **visible**: `boolean` = `true`

Defined in: [src/ui/runtime/widgets.ts:34](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L34)

#### Inherited from

[`UiPanel`](UiPanel.md).[`visible`](UiPanel.md#visible)

***

### width

> **width**: `number` = `0`

Defined in: [src/ui/runtime/widgets.ts:32](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L32)

Tamanho declarado (Panel/Button). Labels medem no backend.

#### Inherited from

[`UiPanel`](UiPanel.md).[`width`](UiPanel.md#width)

***

### x

> **x**: `number` = `0`

Defined in: [src/ui/runtime/widgets.ts:29](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L29)

#### Inherited from

[`UiPanel`](UiPanel.md).[`x`](UiPanel.md#x)

***

### y

> **y**: `number` = `0`

Defined in: [src/ui/runtime/widgets.ts:30](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L30)

#### Inherited from

[`UiPanel`](UiPanel.md).[`y`](UiPanel.md#y)

## Accessors

### borderRadius

#### Get Signature

> **get** **borderRadius**(): `number`

Defined in: [src/ui/runtime/widgets.ts:68](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L68)

`border-radius` do CSS (px). Alias primário de [cornerRadius](UiPanel.md#cornerradius).

##### Returns

`number`

#### Set Signature

> **set** **borderRadius**(`value`): `void`

Defined in: [src/ui/runtime/widgets.ts:71](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/widgets.ts#L71)

##### Parameters

###### value

`number`

##### Returns

`void`

#### Inherited from

[`UiPanel`](UiPanel.md).[`borderRadius`](UiPanel.md#borderradius)

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

[`UiPanel`](UiPanel.md).[`set`](UiPanel.md#set)
