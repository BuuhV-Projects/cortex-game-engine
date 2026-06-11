[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / kitAnchor

# Function: kitAnchor()

> **kitAnchor**(`kits`, `url`, `socket`): \{ `at`: \[`number`, `number`, `number`\]; `dir?`: \[`number`, `number`, `number`\]; `kind`: `"surface"` \| `"connect"`; \} \| `undefined`

Defined in: [src/scene/Kit.ts:163](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Kit.ts#L163)

Âncora nomeada de um asset (via [kitAssetFor](kitAssetFor.md)), ou `undefined`.

## Parameters

### kits

\{ `assets`: `Record`\<`string`, \{ `anchors?`: `Record`\<`string`, \{ `at`: \[`number`, `number`, `number`\]; `dir?`: \[`number`, `number`, `number`\]; `kind`: `"surface"` \| `"connect"`; \}\>; `collider?`: \{ `height?`: `number`; `offsetX?`: `number`; `offsetY?`: `number`; `oneWay?`: `boolean`; `points?`: \[`number`, `number`\][]; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; `width?`: `number`; \}; `gameplayRole?`: `string`[]; `role`: `"background"` \| `"character"` \| `"ground"` \| `"platform"` \| `"connector"` \| `"prop"` \| `"hazard"` \| `"collectible"` \| `"decoration"` \| `"cap"` \| `"tile"` \| `"player-start"` \| `"enemy"`; `size?`: \[`number`, `number`, `number`\]; `sprite?`: \{ `animations?`: `Record`\<`string`, \{ `fps?`: `number`; `frames`: `number`[]; `loop?`: `boolean`; \}\>; `columns?`: `number`; `frameHeight?`: `number`; `frameWidth?`: `number`; `initial?`: `string`; `pixelsPerUnit?`: `number`; `rows?`: `number`; \}; `tags?`: `string`[]; `thumb?`: `string`; \}\>; `module?`: `number`; `name`: `string`; `theme?`: `string`; `version`: `1`; \} \| `object`[] \| `undefined`

#### Type Literal

\{ `assets`: `Record`\<`string`, \{ `anchors?`: `Record`\<`string`, \{ `at`: \[`number`, `number`, `number`\]; `dir?`: \[`number`, `number`, `number`\]; `kind`: `"surface"` \| `"connect"`; \}\>; `collider?`: \{ `height?`: `number`; `offsetX?`: `number`; `offsetY?`: `number`; `oneWay?`: `boolean`; `points?`: \[`number`, `number`\][]; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; `width?`: `number`; \}; `gameplayRole?`: `string`[]; `role`: `"background"` \| `"character"` \| `"ground"` \| `"platform"` \| `"connector"` \| `"prop"` \| `"hazard"` \| `"collectible"` \| `"decoration"` \| `"cap"` \| `"tile"` \| `"player-start"` \| `"enemy"`; `size?`: \[`number`, `number`, `number`\]; `sprite?`: \{ `animations?`: `Record`\<`string`, \{ `fps?`: `number`; `frames`: `number`[]; `loop?`: `boolean`; \}\>; `columns?`: `number`; `frameHeight?`: `number`; `frameWidth?`: `number`; `initial?`: `string`; `pixelsPerUnit?`: `number`; `rows?`: `number`; \}; `tags?`: `string`[]; `thumb?`: `string`; \}\>; `module?`: `number`; `name`: `string`; `theme?`: `string`; `version`: `1`; \}

##### assets

`Record`\<`string`, \{ `anchors?`: `Record`\<`string`, \{ `at`: \[`number`, `number`, `number`\]; `dir?`: \[`number`, `number`, `number`\]; `kind`: `"surface"` \| `"connect"`; \}\>; `collider?`: \{ `height?`: `number`; `offsetX?`: `number`; `offsetY?`: `number`; `oneWay?`: `boolean`; `points?`: \[`number`, `number`\][]; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; `width?`: `number`; \}; `gameplayRole?`: `string`[]; `role`: `"background"` \| `"character"` \| `"ground"` \| `"platform"` \| `"connector"` \| `"prop"` \| `"hazard"` \| `"collectible"` \| `"decoration"` \| `"cap"` \| `"tile"` \| `"player-start"` \| `"enemy"`; `size?`: \[`number`, `number`, `number`\]; `sprite?`: \{ `animations?`: `Record`\<`string`, \{ `fps?`: `number`; `frames`: `number`[]; `loop?`: `boolean`; \}\>; `columns?`: `number`; `frameHeight?`: `number`; `frameWidth?`: `number`; `initial?`: `string`; `pixelsPerUnit?`: `number`; `rows?`: `number`; \}; `tags?`: `string`[]; `thumb?`: `string`; \}\> = `...`

Assets por chave (caminho relativo, ex.: `assets/bridge_001.glb`).

##### module?

`number` = `...`

Unidade de grid/snap em unidades de mundo (a "escala de espaçamento").

##### name

`string` = `...`

##### theme?

`string` = `...`

Nome do tema (paleta + atmosfera) — tokens resolvidos à parte (ADR-0053 §3).

##### version

`1` = `...`

***

`object`[]

***

`undefined`

### url

`string`

### socket

`string`

## Returns

\{ `at`: \[`number`, `number`, `number`\]; `dir?`: \[`number`, `number`, `number`\]; `kind`: `"surface"` \| `"connect"`; \} \| `undefined`
