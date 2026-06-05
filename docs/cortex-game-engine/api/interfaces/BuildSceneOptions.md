[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / BuildSceneOptions

# Interface: BuildSceneOptions

Defined in: src/scene/SceneBuilder.ts:40

## Properties

### overlay?

> `optional` **overlay?**: [`SceneFileV1`](SceneFileV1.md) \| `null`

Defined in: src/scene/SceneBuilder.ts:44

Overlay do editor (overrides de transform + `data.deleted`/`data.added`).

***

### renderer?

> `optional` **renderer?**: [`Renderer`](../classes/Renderer.md)

Defined in: src/scene/SceneBuilder.ts:42

Necessário se alguma definição usa o preset `outdoorLighting`.
