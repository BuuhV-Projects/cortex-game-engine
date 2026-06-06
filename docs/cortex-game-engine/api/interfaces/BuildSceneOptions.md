[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / BuildSceneOptions

# Interface: BuildSceneOptions

Defined in: [src/scene/SceneBuilder.ts:46](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L46)

## Properties

### overlay?

> `optional` **overlay?**: [`SceneFileV1`](SceneFileV1.md) \| `null`

Defined in: [src/scene/SceneBuilder.ts:50](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L50)

Overlay do editor (overrides de transform + `data.deleted`/`data.added`).

***

### renderer?

> `optional` **renderer?**: [`Renderer`](../classes/Renderer.md)

Defined in: [src/scene/SceneBuilder.ts:48](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L48)

Necessário se alguma definição usa o preset `outdoorLighting`.

***

### world?

> `optional` **world?**: [`World`](../classes/World.md)

Defined in: [src/scene/SceneBuilder.ts:57](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L57)

Mundo ECS — quando presente, nós com `collider`/`player` viram entidades
(Transform + Object3D + Collider2D [+ PlatformerBody + FollowCameraTarget]),
pra a física de plataforma agir. Registre os sistemas (Object3DSync,
PlatformerPhysics/Input, FollowCamera2D) — ou use `setupPlatformer`.
