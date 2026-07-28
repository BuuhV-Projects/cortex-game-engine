[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / kitAssetFor

# Function: kitAssetFor()

> **kitAssetFor**(`kits`, `url`): \{ `anchors?`: `Record`\<`string`, \{ `at`: \[`number`, `number`, `number`\]; `dir?`: \[`number`, `number`, `number`\]; `kind`: `"surface"` \| `"connect"`; \}\>; `collider?`: \{ `oneWay?`: `boolean`; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; \}; `gameplayRole?`: `string`[]; `role`: `string`; `size?`: \[`number`, `number`, `number`\]; `tags?`: `string`[]; `thumb?`: `string`; \} \| `undefined`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/Kit.ts:88](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Kit.ts#L88)

Acha os metadados de um asset pelo `url` do nó da cena. As chaves do
`kit.json` são relativas ao kit (`assets/rock.glb`); os `url` da cena
costumam ter prefixo de projeto (`assets/platformer-base/rock.glb`) — o
match tenta chave exata, sufixo de caminho e por último o basename.

## Parameters

### kits

\{ `assets`: `Record`\<`string`, \{ `anchors?`: `Record`\<`string`, \{ `at`: \[`number`, `number`, `number`\]; `dir?`: \[`number`, `number`, `number`\]; `kind`: `"surface"` \| `"connect"`; \}\>; `collider?`: \{ `oneWay?`: `boolean`; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; \}; `gameplayRole?`: `string`[]; `role`: `string`; `size?`: \[`number`, `number`, `number`\]; `tags?`: `string`[]; `thumb?`: `string`; \}\>; `module?`: `number`; `name`: `string`; `theme?`: `string`; `version`: `1`; \} \| `object`[] \| `undefined`

#### Type Literal

\{ `assets`: `Record`\<`string`, \{ `anchors?`: `Record`\<`string`, \{ `at`: \[`number`, `number`, `number`\]; `dir?`: \[`number`, `number`, `number`\]; `kind`: `"surface"` \| `"connect"`; \}\>; `collider?`: \{ `oneWay?`: `boolean`; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; \}; `gameplayRole?`: `string`[]; `role`: `string`; `size?`: \[`number`, `number`, `number`\]; `tags?`: `string`[]; `thumb?`: `string`; \}\>; `module?`: `number`; `name`: `string`; `theme?`: `string`; `version`: `1`; \}

##### assets

`Record`\<`string`, \{ `anchors?`: `Record`\<`string`, \{ `at`: \[`number`, `number`, `number`\]; `dir?`: \[`number`, `number`, `number`\]; `kind`: `"surface"` \| `"connect"`; \}\>; `collider?`: \{ `oneWay?`: `boolean`; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; \}; `gameplayRole?`: `string`[]; `role`: `string`; `size?`: \[`number`, `number`, `number`\]; `tags?`: `string`[]; `thumb?`: `string`; \}\> = `...`

Chaves = caminho do asset dentro do kit (ex.: `assets/bridge.glb`).

##### module?

`number` = `...`

Unidade de grid/snap do kit (escala de espaçamento).

##### name

`string` = `...`

##### theme?

`string` = `...`

Design tokens de atmosfera (nome do tema).

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

\{ `anchors?`: `Record`\<`string`, \{ `at`: \[`number`, `number`, `number`\]; `dir?`: \[`number`, `number`, `number`\]; `kind`: `"surface"` \| `"connect"`; \}\>; `collider?`: \{ `oneWay?`: `boolean`; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; \}; `gameplayRole?`: `string`[]; `role`: `string`; `size?`: \[`number`, `number`, `number`\]; `tags?`: `string`[]; `thumb?`: `string`; \}

#### anchors?

> `optional` **anchors?**: `Record`\<`string`, \{ `at`: \[`number`, `number`, `number`\]; `dir?`: \[`number`, `number`, `number`\]; `kind`: `"surface"` \| `"connect"`; \}\>

Sockets nomeados (`top`, `edge_left`, `a`/`b` de conector, …).

#### collider?

> `optional` **collider?**: `object`

##### collider.oneWay?

> `optional` **oneWay?**: `boolean`

##### collider.shape?

> `optional` **shape?**: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`

##### collider.solid?

> `optional` **solid?**: `boolean`

#### gameplayRole?

> `optional` **gameplayRole?**: `string`[]

Função de design: `guidance | reward | challenge | safe-zone | landmark | cover | resource | path | hazard | player`.

#### role

> **role**: `string`

Natureza física. Vocabulário canônico (aberto a extensão): `ground | platform
| connector | prop | hazard | collectible | decoration | cap | tile |
player-start | character | enemy | rig | character-part | background`.

#### size?

> `optional` **size?**: \[`number`, `number`, `number`\]

Bbox `[w, h, d]` em Y-up (cacheado do pipeline de kit).

#### tags?

> `optional` **tags?**: `string`[]

Tema/bioma + classe de tamanho (`forest`, `S/M/L`, …).

#### thumb?

> `optional` **thumb?**: `string`

***

`undefined`
