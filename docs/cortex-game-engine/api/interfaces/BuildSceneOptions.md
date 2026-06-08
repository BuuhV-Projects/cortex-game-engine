[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / BuildSceneOptions

# Interface: BuildSceneOptions

Defined in: [src/scene/SceneBuilder.ts:60](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L60)

## Properties

### kit?

> `optional` **kit?**: \{ `assets`: `Record`\<`string`, \{ `anchors?`: `Record`\<`string`, \{ `at`: \[`number`, `number`, `number`\]; `dir?`: \[`number`, `number`, `number`\]; `kind`: `"surface"` \| `"connect"`; \}\>; `collider?`: \{ `height?`: `number`; `offsetX?`: `number`; `offsetY?`: `number`; `oneWay?`: `boolean`; `points?`: \[`number`, `number`\][]; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; `width?`: `number`; \}; `gameplayRole?`: `string`[]; `role`: `"ground"` \| `"platform"` \| `"connector"` \| `"prop"` \| `"hazard"` \| `"collectible"` \| `"decoration"` \| `"cap"` \| `"tile"` \| `"player-start"`; `size?`: \[`number`, `number`, `number`\]; `tags?`: `string`[]; `thumb?`: `string`; \}\>; `module?`: `number`; `name`: `string`; `theme?`: `string`; `version`: `1`; \} \| `object`[]

Defined in: [src/scene/SceneBuilder.ts:78](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L78)

Kit(s) de assets (manifesto(s) `kit.json`, ADR-0053). Quando presente: nós
`model` herdam o **preset de collider por `role`** do kit (se não definirem
`collider` próprio), e nós com `attach` são posicionados por **socket** a
partir das âncoras do kit.

#### Union Members

##### Type Literal

\{ `assets`: `Record`\<`string`, \{ `anchors?`: `Record`\<`string`, \{ `at`: \[`number`, `number`, `number`\]; `dir?`: \[`number`, `number`, `number`\]; `kind`: `"surface"` \| `"connect"`; \}\>; `collider?`: \{ `height?`: `number`; `offsetX?`: `number`; `offsetY?`: `number`; `oneWay?`: `boolean`; `points?`: \[`number`, `number`\][]; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; `width?`: `number`; \}; `gameplayRole?`: `string`[]; `role`: `"ground"` \| `"platform"` \| `"connector"` \| `"prop"` \| `"hazard"` \| `"collectible"` \| `"decoration"` \| `"cap"` \| `"tile"` \| `"player-start"`; `size?`: \[`number`, `number`, `number`\]; `tags?`: `string`[]; `thumb?`: `string`; \}\>; `module?`: `number`; `name`: `string`; `theme?`: `string`; `version`: `1`; \}

##### assets

> **assets**: `Record`\<`string`, \{ `anchors?`: `Record`\<`string`, \{ `at`: \[`number`, `number`, `number`\]; `dir?`: \[`number`, `number`, `number`\]; `kind`: `"surface"` \| `"connect"`; \}\>; `collider?`: \{ `height?`: `number`; `offsetX?`: `number`; `offsetY?`: `number`; `oneWay?`: `boolean`; `points?`: \[`number`, `number`\][]; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; `width?`: `number`; \}; `gameplayRole?`: `string`[]; `role`: `"ground"` \| `"platform"` \| `"connector"` \| `"prop"` \| `"hazard"` \| `"collectible"` \| `"decoration"` \| `"cap"` \| `"tile"` \| `"player-start"`; `size?`: \[`number`, `number`, `number`\]; `tags?`: `string`[]; `thumb?`: `string`; \}\>

Assets por chave (caminho relativo, ex.: `assets/bridge_001.glb`).

##### module?

> `optional` **module?**: `number`

Unidade de grid/snap em unidades de mundo (a "escala de espaçamento").

##### name

> **name**: `string`

##### theme?

> `optional` **theme?**: `string`

Nome do tema (paleta + atmosfera) — tokens resolvidos à parte (ADR-0053 §3).

##### version

> **version**: `1`

***

`object`[]

***

### overlay?

> `optional` **overlay?**: [`SceneFileV1`](SceneFileV1.md) \| `null`

Defined in: [src/scene/SceneBuilder.ts:64](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L64)

Overlay do editor (overrides de transform + `data.deleted`/`data.added`).

***

### renderer?

> `optional` **renderer?**: [`Renderer`](../classes/Renderer.md)

Defined in: [src/scene/SceneBuilder.ts:62](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L62)

Necessário se alguma definição usa o preset `outdoorLighting`.

***

### world?

> `optional` **world?**: [`World`](../classes/World.md)

Defined in: [src/scene/SceneBuilder.ts:71](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L71)

Mundo ECS — quando presente, nós com `collider`/`player` viram entidades
(Transform + Object3D + Collider2D [+ PlatformerBody + FollowCameraTarget]),
pra a física de plataforma agir. Registre os sistemas (Object3DSync,
PlatformerPhysics/Input, FollowCamera2D) — ou use `setupPlatformer`.
