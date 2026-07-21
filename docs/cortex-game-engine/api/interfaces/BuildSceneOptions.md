[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / BuildSceneOptions

# Interface: BuildSceneOptions

Defined in: [src/scene/SceneBuilder.ts:91](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L91)

## Properties

### camera?

> `optional` **camera?**: `OrthographicCamera` \| `PerspectiveCamera`

Defined in: [src/scene/SceneBuilder.ts:112](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L112)

Câmera do jogo — **necessária** se a cena tem nós `background` (o backdrop
segue a câmera e rola em parallax). Passe `game.camera`.

***

### kit?

> `optional` **kit?**: \{ `assets`: `Record`\<`string`, \{ `anchors?`: `Record`\<`string`, \{ `at`: \[`number`, `number`, `number`\]; `dir?`: \[`number`, `number`, `number`\]; `kind`: `"surface"` \| `"connect"`; \}\>; `collider?`: \{ `oneWay?`: `boolean`; `shape?`: `"box"` \| `"capsule"` \| `"circle"` \| `"heightfield"`; `solid?`: `boolean`; \}; `gameplayRole?`: `string`[]; `role`: `string`; `size?`: \[`number`, `number`, `number`\]; `tags?`: `string`[]; `thumb?`: `string`; \}\>; `module?`: `number`; `name`: `string`; `theme?`: `string`; `version`: `1`; \} \| `object`[]

Defined in: [src/scene/SceneBuilder.ts:125](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L125)

Manifesto(s) de kit (`kit.json` parseado com [parseKit](../functions/parseKit.md); ADR-0053) —
habilita o encaixe por socket (`attach` nos nós) e o preset de collider por
`role` do asset (o `collider` do nó/overlay vence o preset).

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

### matte?

> `optional` **matte?**: `boolean`

Defined in: [src/scene/SceneBuilder.ts:107](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L107)

Deixa **todos** os modelos foscos (mata o brilho PBR → look cartoon/desenho).
Um nó pode sobrescrever com `matte: false`. Atalho global do [setMatte](../functions/setMatte.md).

***

### mergeStatic?

> `optional` **mergeStatic?**: `boolean`

Defined in: [src/scene/SceneBuilder.ts:133](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L133)

Funde a geometria ESTÁTICA da cena em poucas malhas por material ao final do
build (SPEC-0120, [mergeStaticScene](../functions/mergeStaticScene.md)) — derruba draw calls onde o render
é CPU-bound (host nativo/Hermes). Default: **liga sozinho no host nativo**
(`isNativeHost()`), desligado no browser/Studio (o editor F2 precisa dos
objetos individuais). `true`/`false` força.

***

### overlay?

> `optional` **overlay?**: [`SceneFileV1`](SceneFileV1.md) \| `null`

Defined in: [src/scene/SceneBuilder.ts:95](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L95)

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

### renderBundles?

> `optional` **renderBundles?**: `boolean`

Defined in: [src/scene/SceneBuilder.ts:142](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L142)

Envolve a geometria estática FUNDIDA num `BundleGroup` (render bundles do
WebGPU — M-perf-2b/SPEC-0136): o renderer grava os draws uma vez e no replay
vira 1 `executeBundles` por pass, cortando as milhares de travessias NAPI por
frame no host nativo. Só faz efeito com `mergeStatic` (é o estático fundido
que entra). Default `false`; o host liga junto do merge. `BundleGroup` assume
estrutura estática — reconstrua a cena (novo `buildScene`) pra mudar.

***

### renderer?

> `optional` **renderer?**: [`Renderer`](../classes/Renderer.md)

Defined in: [src/scene/SceneBuilder.ts:93](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L93)

Necessário se alguma definição usa o preset `outdoorLighting`.

***

### world?

> `optional` **world?**: [`World`](../classes/World.md)

Defined in: [src/scene/SceneBuilder.ts:102](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L102)

Mundo ECS — quando presente, nós com `collider`/`player` viram entidades
(Transform + Object3D + Collider2D [+ PlatformerBody + FollowCameraTarget]),
pra a física de plataforma agir. Registre os sistemas (Object3DSync,
PlatformerPhysics/Input, FollowCamera2D) — ou use `setupPlatformer`.
