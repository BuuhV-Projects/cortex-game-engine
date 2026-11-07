[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / ModelHotReloadEvent

# Interface: ModelHotReloadEvent

Defined in: [src/scene/ModelHotReload.ts:27](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/ModelHotReload.ts#L27)

Uma raiz trocada pelo [hotReloadModel](../functions/hotReloadModel.md) — o que o jogo recebe para religar referências.

## Properties

### oldChildren

> **oldChildren**: `Object3D`\<`Object3DEventMap`\>[]

Defined in: [src/scene/ModelHotReload.ts:33](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/ModelHotReload.ts#L33)

Os filhos do GLB velho que saíram da raiz (destacados; recursos liberados no `clearSceneAssetCaches`).

***

### root

> **root**: `Object3D`

Defined in: [src/scene/ModelHotReload.ts:31](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/ModelHotReload.ts#L31)

A raiz preservada (mesmo `Object3D` de antes, agora com os filhos novos).

***

### url

> **url**: `string`

Defined in: [src/scene/ModelHotReload.ts:29](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/ModelHotReload.ts#L29)

URL normalizada do GLB.
