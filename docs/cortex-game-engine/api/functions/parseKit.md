[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / parseKit

# Function: parseKit()

> **parseKit**(`raw`): \{ `assets`: `Record`\<`string`, \{ `anchors?`: `Record`\<`string`, \{ `at`: \[`number`, `number`, `number`\]; `dir?`: \[`number`, `number`, `number`\]; `kind`: `"surface"` \| `"connect"`; \}\>; `collider?`: \{ `oneWay?`: `boolean`; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; \}; `gameplayRole?`: `string`[]; `role`: `string`; `size?`: \[`number`, `number`, `number`\]; `tags?`: `string`[]; `thumb?`: `string`; \}\>; `module?`: `number`; `name`: `string`; `theme?`: `string`; `version`: `1`; \} \| `null`

Defined in: [src/scene/Kit.ts:77](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/Kit.ts#L77)

Valida/parseia um `kit.json` importado. Retorna `null` se inválido (padrão
[parseSceneDefinition](parseSceneDefinition.md) — quem consome decide falhar alto).

## Parameters

### raw

`unknown`

## Returns

### Type Literal

\{ `assets`: `Record`\<`string`, \{ `anchors?`: `Record`\<`string`, \{ `at`: \[`number`, `number`, `number`\]; `dir?`: \[`number`, `number`, `number`\]; `kind`: `"surface"` \| `"connect"`; \}\>; `collider?`: \{ `oneWay?`: `boolean`; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; \}; `gameplayRole?`: `string`[]; `role`: `string`; `size?`: \[`number`, `number`, `number`\]; `tags?`: `string`[]; `thumb?`: `string`; \}\>; `module?`: `number`; `name`: `string`; `theme?`: `string`; `version`: `1`; \}

#### assets

> **assets**: `Record`\<`string`, \{ `anchors?`: `Record`\<`string`, \{ `at`: \[`number`, `number`, `number`\]; `dir?`: \[`number`, `number`, `number`\]; `kind`: `"surface"` \| `"connect"`; \}\>; `collider?`: \{ `oneWay?`: `boolean`; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; \}; `gameplayRole?`: `string`[]; `role`: `string`; `size?`: \[`number`, `number`, `number`\]; `tags?`: `string`[]; `thumb?`: `string`; \}\>

Chaves = caminho do asset dentro do kit (ex.: `assets/bridge.glb`).

#### module?

> `optional` **module?**: `number`

Unidade de grid/snap do kit (escala de espaçamento).

#### name

> **name**: `string`

#### theme?

> `optional` **theme?**: `string`

Design tokens de atmosfera (nome do tema).

#### version

> **version**: `1`

***

`null`
