[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / BuildSceneOptions

# Interface: BuildSceneOptions

Defined in: [src/scene/SceneBuilder.ts:84](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L84)

## Properties

### camera?

> `optional` **camera?**: `PerspectiveCamera` \| `OrthographicCamera`

Defined in: [src/scene/SceneBuilder.ts:112](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L112)

Câmera do jogo — **necessária** se a cena tem nós `background` (o backdrop
segue a câmera e rola em parallax). Passe `game.camera`.

***

### kit?

> `optional` **kit?**: \{ `assets`: `Record`\<`string`, \{ `anchors?`: `Record`\<`string`, \{ `at`: \[`number`, `number`, `number`\]; `dir?`: \[`number`, `number`, `number`\]; `kind`: `"surface"` \| `"connect"`; \}\>; `collider?`: \{ `height?`: `number`; `offsetX?`: `number`; `offsetY?`: `number`; `oneWay?`: `boolean`; `points?`: \[`number`, `number`\][]; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; `width?`: `number`; \}; `gameplayRole?`: `string`[]; `role`: `"background"` \| `"character"` \| `"ground"` \| `"platform"` \| `"connector"` \| `"prop"` \| `"hazard"` \| `"collectible"` \| `"decoration"` \| `"cap"` \| `"tile"` \| `"player-start"` \| `"enemy"`; `size?`: \[`number`, `number`, `number`\]; `sprite?`: \{ `animations?`: `Record`\<`string`, \{ `fps?`: `number`; `frames`: `number`[]; `loop?`: `boolean`; \}\>; `columns?`: `number`; `frameHeight?`: `number`; `frameWidth?`: `number`; `initial?`: `string`; `pixelsPerUnit?`: `number`; `rows?`: `number`; \}; `tags?`: `string`[]; `thumb?`: `string`; \}\>; `module?`: `number`; `name`: `string`; `theme?`: `string`; `version`: `1`; \} \| `object`[]

Defined in: [src/scene/SceneBuilder.ts:102](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L102)

Kit(s) de assets (manifesto(s) `kit.json`, ADR-0053). Quando presente: nós
`model` herdam o **preset de collider por `role`** do kit (se não definirem
`collider` próprio), e nós com `attach` são posicionados por **socket** a
partir das âncoras do kit.

#### Union Members

##### Type Literal

\{ `assets`: `Record`\<`string`, \{ `anchors?`: `Record`\<`string`, \{ `at`: \[`number`, `number`, `number`\]; `dir?`: \[`number`, `number`, `number`\]; `kind`: `"surface"` \| `"connect"`; \}\>; `collider?`: \{ `height?`: `number`; `offsetX?`: `number`; `offsetY?`: `number`; `oneWay?`: `boolean`; `points?`: \[`number`, `number`\][]; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; `width?`: `number`; \}; `gameplayRole?`: `string`[]; `role`: `"background"` \| `"character"` \| `"ground"` \| `"platform"` \| `"connector"` \| `"prop"` \| `"hazard"` \| `"collectible"` \| `"decoration"` \| `"cap"` \| `"tile"` \| `"player-start"` \| `"enemy"`; `size?`: \[`number`, `number`, `number`\]; `sprite?`: \{ `animations?`: `Record`\<`string`, \{ `fps?`: `number`; `frames`: `number`[]; `loop?`: `boolean`; \}\>; `columns?`: `number`; `frameHeight?`: `number`; `frameWidth?`: `number`; `initial?`: `string`; `pixelsPerUnit?`: `number`; `rows?`: `number`; \}; `tags?`: `string`[]; `thumb?`: `string`; \}\>; `module?`: `number`; `name`: `string`; `theme?`: `string`; `version`: `1`; \}

##### assets

> **assets**: `Record`\<`string`, \{ `anchors?`: `Record`\<`string`, \{ `at`: \[`number`, `number`, `number`\]; `dir?`: \[`number`, `number`, `number`\]; `kind`: `"surface"` \| `"connect"`; \}\>; `collider?`: \{ `height?`: `number`; `offsetX?`: `number`; `offsetY?`: `number`; `oneWay?`: `boolean`; `points?`: \[`number`, `number`\][]; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; `width?`: `number`; \}; `gameplayRole?`: `string`[]; `role`: `"background"` \| `"character"` \| `"ground"` \| `"platform"` \| `"connector"` \| `"prop"` \| `"hazard"` \| `"collectible"` \| `"decoration"` \| `"cap"` \| `"tile"` \| `"player-start"` \| `"enemy"`; `size?`: \[`number`, `number`, `number`\]; `sprite?`: \{ `animations?`: `Record`\<`string`, \{ `fps?`: `number`; `frames`: `number`[]; `loop?`: `boolean`; \}\>; `columns?`: `number`; `frameHeight?`: `number`; `frameWidth?`: `number`; `initial?`: `string`; `pixelsPerUnit?`: `number`; `rows?`: `number`; \}; `tags?`: `string`[]; `thumb?`: `string`; \}\>

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

### matte?

> `optional` **matte?**: `boolean`

Defined in: [src/scene/SceneBuilder.ts:107](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L107)

Deixa **todos** os modelos foscos (mata o brilho PBR → look cartoon/desenho).
Um nó pode sobrescrever com `matte: false`. Atalho global do [setMatte](../functions/setMatte.md).

***

### overlay?

> `optional` **overlay?**: [`SceneFileV1`](SceneFileV1.md) \| `null`

Defined in: [src/scene/SceneBuilder.ts:88](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L88)

Overlay do editor (overrides de transform + `data.deleted`/`data.added`).

***

### physicsPaused?

> `optional` **physicsPaused?**: () => `boolean`

Defined in: [src/scene/SceneBuilder.ts:119](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L119)

Predicado pra **pausar a física de Character** (gravidade/pulo) — o
`CharacterPhysicsSystem` que o `buildScene` registra pra nós `character`
recebe isso como `pauseWhen`. Passe `() => game.editorActive` pra o personagem
não cair enquanto você edita a cena no F2. Sem isso, a física roda sempre.

#### Returns

`boolean`

***

### renderer?

> `optional` **renderer?**: [`Renderer`](../classes/Renderer.md)

Defined in: [src/scene/SceneBuilder.ts:86](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L86)

Necessário se alguma definição usa o preset `outdoorLighting`.

***

### world?

> `optional` **world?**: [`World`](../classes/World.md)

Defined in: [src/scene/SceneBuilder.ts:95](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L95)

Mundo ECS — quando presente, nós com `collider`/`player` viram entidades
(Transform + Object3D + Collider2D [+ PlatformerBody + FollowCameraTarget]),
pra a física de plataforma agir. Registre os sistemas (Object3DSync,
PlatformerPhysics/Input, FollowCamera2D) — ou use `setupPlatformer`.
