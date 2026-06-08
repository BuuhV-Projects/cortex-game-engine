[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / kitAssetFor

# Function: kitAssetFor()

> **kitAssetFor**(`kits`, `url`): \{ `anchors?`: `Record`\<`string`, \{ `at`: \[`number`, `number`, `number`\]; `dir?`: \[`number`, `number`, `number`\]; `kind`: `"surface"` \| `"connect"`; \}\>; `collider?`: \{ `height?`: `number`; `offsetX?`: `number`; `offsetY?`: `number`; `oneWay?`: `boolean`; `points?`: \[`number`, `number`\][]; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; `width?`: `number`; \}; `gameplayRole?`: `string`[]; `role`: `"background"` \| `"ground"` \| `"platform"` \| `"connector"` \| `"prop"` \| `"hazard"` \| `"collectible"` \| `"decoration"` \| `"cap"` \| `"tile"` \| `"player-start"` \| `"character"` \| `"enemy"`; `size?`: \[`number`, `number`, `number`\]; `tags?`: `string`[]; `thumb?`: `string`; \} \| `undefined`

Defined in: [src/scene/Kit.ts:109](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Kit.ts#L109)

Acha o [KitAsset](../type-aliases/KitAsset.md) de um `url` de nó. Casa pela **chave exata** do kit
(`assets/bridge.glb`) ou, em fallback, pelo **basename** (`bridge.glb`) — assim
o nó pode referenciar o asset com prefixo diferente do usado no kit.

## Parameters

### kits

\{ `assets`: `Record`\<`string`, \{ `anchors?`: `Record`\<`string`, \{ `at`: \[`number`, `number`, `number`\]; `dir?`: \[`number`, `number`, `number`\]; `kind`: `"surface"` \| `"connect"`; \}\>; `collider?`: \{ `height?`: `number`; `offsetX?`: `number`; `offsetY?`: `number`; `oneWay?`: `boolean`; `points?`: \[`number`, `number`\][]; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; `width?`: `number`; \}; `gameplayRole?`: `string`[]; `role`: `"background"` \| `"ground"` \| `"platform"` \| `"connector"` \| `"prop"` \| `"hazard"` \| `"collectible"` \| `"decoration"` \| `"cap"` \| `"tile"` \| `"player-start"` \| `"character"` \| `"enemy"`; `size?`: \[`number`, `number`, `number`\]; `tags?`: `string`[]; `thumb?`: `string`; \}\>; `module?`: `number`; `name`: `string`; `theme?`: `string`; `version`: `1`; \} \| `object`[] \| `undefined`

#### Type Literal

\{ `assets`: `Record`\<`string`, \{ `anchors?`: `Record`\<`string`, \{ `at`: \[`number`, `number`, `number`\]; `dir?`: \[`number`, `number`, `number`\]; `kind`: `"surface"` \| `"connect"`; \}\>; `collider?`: \{ `height?`: `number`; `offsetX?`: `number`; `offsetY?`: `number`; `oneWay?`: `boolean`; `points?`: \[`number`, `number`\][]; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; `width?`: `number`; \}; `gameplayRole?`: `string`[]; `role`: `"background"` \| `"ground"` \| `"platform"` \| `"connector"` \| `"prop"` \| `"hazard"` \| `"collectible"` \| `"decoration"` \| `"cap"` \| `"tile"` \| `"player-start"` \| `"character"` \| `"enemy"`; `size?`: \[`number`, `number`, `number`\]; `tags?`: `string`[]; `thumb?`: `string`; \}\>; `module?`: `number`; `name`: `string`; `theme?`: `string`; `version`: `1`; \}

##### assets

`Record`\<`string`, \{ `anchors?`: `Record`\<`string`, \{ `at`: \[`number`, `number`, `number`\]; `dir?`: \[`number`, `number`, `number`\]; `kind`: `"surface"` \| `"connect"`; \}\>; `collider?`: \{ `height?`: `number`; `offsetX?`: `number`; `offsetY?`: `number`; `oneWay?`: `boolean`; `points?`: \[`number`, `number`\][]; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; `width?`: `number`; \}; `gameplayRole?`: `string`[]; `role`: `"background"` \| `"ground"` \| `"platform"` \| `"connector"` \| `"prop"` \| `"hazard"` \| `"collectible"` \| `"decoration"` \| `"cap"` \| `"tile"` \| `"player-start"` \| `"character"` \| `"enemy"`; `size?`: \[`number`, `number`, `number`\]; `tags?`: `string`[]; `thumb?`: `string`; \}\> = `...`

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

## Returns

### Type Literal

\{ `anchors?`: `Record`\<`string`, \{ `at`: \[`number`, `number`, `number`\]; `dir?`: \[`number`, `number`, `number`\]; `kind`: `"surface"` \| `"connect"`; \}\>; `collider?`: \{ `height?`: `number`; `offsetX?`: `number`; `offsetY?`: `number`; `oneWay?`: `boolean`; `points?`: \[`number`, `number`\][]; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; `width?`: `number`; \}; `gameplayRole?`: `string`[]; `role`: `"background"` \| `"ground"` \| `"platform"` \| `"connector"` \| `"prop"` \| `"hazard"` \| `"collectible"` \| `"decoration"` \| `"cap"` \| `"tile"` \| `"player-start"` \| `"character"` \| `"enemy"`; `size?`: \[`number`, `number`, `number`\]; `tags?`: `string`[]; `thumb?`: `string`; \}

#### anchors?

> `optional` **anchors?**: `Record`\<`string`, \{ `at`: \[`number`, `number`, `number`\]; `dir?`: \[`number`, `number`, `number`\]; `kind`: `"surface"` \| `"connect"`; \}\>

Sockets/âncoras por nome (`top`, `edge_left`, …).

#### collider?

> `optional` **collider?**: `object` = `kitColliderSchema`

##### collider.height?

> `optional` **height?**: `number`

##### collider.offsetX?

> `optional` **offsetX?**: `number`

##### collider.offsetY?

> `optional` **offsetY?**: `number`

##### collider.oneWay?

> `optional` **oneWay?**: `boolean`

##### collider.points?

> `optional` **points?**: \[`number`, `number`\][]

##### collider.shape?

> `optional` **shape?**: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`

##### collider.solid?

> `optional` **solid?**: `boolean`

##### collider.width?

> `optional` **width?**: `number`

#### gameplayRole?

> `optional` **gameplayRole?**: `string`[]

Função de design (`guidance`, `reward`, `landmark`, `cover`, …).

#### role

> **role**: `"background"` \| `"ground"` \| `"platform"` \| `"connector"` \| `"prop"` \| `"hazard"` \| `"collectible"` \| `"decoration"` \| `"cap"` \| `"tile"` \| `"player-start"` \| `"character"` \| `"enemy"`

#### size?

> `optional` **size?**: \[`number`, `number`, `number`\]

Bounding box `[x, y, z]` em unidades do engine (Y-up).

#### tags?

> `optional` **tags?**: `string`[]

Tema/bioma + size-class (`forest`, `rock`, `S/M/L`, …).

#### thumb?

> `optional` **thumb?**: `string`

Caminho relativo do thumbnail (`thumbnails/<name>.png`).

***

`undefined`
