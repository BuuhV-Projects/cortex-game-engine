[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / BuildSceneOptions

# Interface: BuildSceneOptions

Defined in: [src/scene/SceneBuilder.ts:90](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L90)

## Properties

### camera?

> `optional` **camera?**: `OrthographicCamera` \| `PerspectiveCamera`

Defined in: [src/scene/SceneBuilder.ts:111](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L111)

Câmera do jogo — **necessária** se a cena tem nós `background` (o backdrop
segue a câmera e rola em parallax). Passe `game.camera`.

***

### matte?

> `optional` **matte?**: `boolean`

Defined in: [src/scene/SceneBuilder.ts:106](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L106)

Deixa **todos** os modelos foscos (mata o brilho PBR → look cartoon/desenho).
Um nó pode sobrescrever com `matte: false`. Atalho global do [setMatte](../functions/setMatte.md).

***

### overlay?

> `optional` **overlay?**: [`SceneFileV1`](SceneFileV1.md) \| `null`

Defined in: [src/scene/SceneBuilder.ts:94](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L94)

Overlay do editor (overrides de transform + `data.deleted`/`data.added`).

***

### physicsPaused?

> `optional` **physicsPaused?**: () => `boolean`

Defined in: [src/scene/SceneBuilder.ts:118](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L118)

Predicado pra **pausar a física de Character** (gravidade/pulo) — o
`CharacterPhysicsSystem` que o `buildScene` registra pra nós `character`
recebe isso como `pauseWhen`. Passe `() => game.editorActive` pra o personagem
não cair enquanto você edita a cena no F2. Sem isso, a física roda sempre.

#### Returns

`boolean`

***

### renderer?

> `optional` **renderer?**: [`Renderer`](../classes/Renderer.md)

Defined in: [src/scene/SceneBuilder.ts:92](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L92)

Necessário se alguma definição usa o preset `outdoorLighting`.

***

### world?

> `optional` **world?**: [`World`](../classes/World.md)

Defined in: [src/scene/SceneBuilder.ts:101](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L101)

Mundo ECS — quando presente, nós com `collider`/`player` viram entidades
(Transform + Object3D + Collider2D [+ PlatformerBody + FollowCameraTarget]),
pra a física de plataforma agir. Registre os sistemas (Object3DSync,
PlatformerPhysics/Input, FollowCamera2D) — ou use `setupPlatformer`.
