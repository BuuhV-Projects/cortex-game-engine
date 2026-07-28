[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / ValidateSceneOptions

# Interface: ValidateSceneOptions

Defined in: [src/scene/validateScene.ts:36](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/validateScene.ts#L36)

## Properties

### kit?

> `optional` **kit?**: \{ `assets`: `Record`\<`string`, \{ `anchors?`: `Record`\<`string`, \{ `at`: \[`number`, `number`, `number`\]; `dir?`: \[`number`, `number`, `number`\]; `kind`: `"surface"` \| `"connect"`; \}\>; `collider?`: \{ `oneWay?`: `boolean`; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; \}; `gameplayRole?`: `string`[]; `role`: `string`; `size?`: \[`number`, `number`, `number`\]; `tags?`: `string`[]; `thumb?`: `string`; \}\>; `module?`: `number`; `name`: `string`; `theme?`: `string`; `version`: `1`; \} \| `object`[]

Defined in: [src/scene/validateScene.ts:37](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/validateScene.ts#L37)

#### Union Members

##### Type Literal

\{ `assets`: `Record`\<`string`, \{ `anchors?`: `Record`\<`string`, \{ `at`: \[`number`, `number`, `number`\]; `dir?`: \[`number`, `number`, `number`\]; `kind`: `"surface"` \| `"connect"`; \}\>; `collider?`: \{ `oneWay?`: `boolean`; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; \}; `gameplayRole?`: `string`[]; `role`: `string`; `size?`: \[`number`, `number`, `number`\]; `tags?`: `string`[]; `thumb?`: `string`; \}\>; `module?`: `number`; `name`: `string`; `theme?`: `string`; `version`: `1`; \}

##### assets

> **assets**: `Record`\<`string`, \{ `anchors?`: `Record`\<`string`, \{ `at`: \[`number`, `number`, `number`\]; `dir?`: \[`number`, `number`, `number`\]; `kind`: `"surface"` \| `"connect"`; \}\>; `collider?`: \{ `oneWay?`: `boolean`; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; \}; `gameplayRole?`: `string`[]; `role`: `string`; `size?`: \[`number`, `number`, `number`\]; `tags?`: `string`[]; `thumb?`: `string`; \}\>

Chaves = caminho do asset dentro do kit (ex.: `assets/bridge.glb`).

##### module?

> `optional` **module?**: `number`

Unidade de grid/snap do kit (escala de espaçamento).

##### name

> **name**: `string`

##### theme?

> `optional` **theme?**: `string`

Design tokens de atmosfera (nome do tema).

##### version

> **version**: `1`

***

`object`[]

***

### maxGap?

> `optional` **maxGap?**: `number`

Defined in: [src/scene/validateScene.ts:40](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/validateScene.ts#L40)

Maior vão horizontal pulável (unidades). Default 2.8 (lint R4).

***

### maxPenetration?

> `optional` **maxPenetration?**: `number`

Defined in: [src/scene/validateScene.ts:44](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/validateScene.ts#L44)

Interpenetração acima disso é `error` (abaixo, `warning`). Default 0.15.

***

### maxRise?

> `optional` **maxRise?**: `number`

Defined in: [src/scene/validateScene.ts:42](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/validateScene.ts#L42)

Maior subida entre plataformas vizinhas. Default 3.

***

### overlay?

> `optional` **overlay?**: [`SceneFileV1`](SceneFileV1.md) \| `null`

Defined in: [src/scene/validateScene.ts:38](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/validateScene.ts#L38)

***

### severity?

> `optional` **severity?**: `Record`\<`string`, `"error"` \| `"off"` \| `"warning"`\>

Defined in: [src/scene/validateScene.ts:51](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/validateScene.ts#L51)

Override de severidade POR REGRA (`overlap`, `floating`, `gap`…): força
`error`/`warning` ou suprime com `off`. É por onde regras APRENDIDAS do
projeto (`.cortex/validation-rules.json`, ADR-0115) endurecem ou relaxam o
validador sem mudar o código do engine.
