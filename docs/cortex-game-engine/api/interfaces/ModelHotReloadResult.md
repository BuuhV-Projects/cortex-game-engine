[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / ModelHotReloadResult

# Interface: ModelHotReloadResult

Defined in: [src/scene/ModelHotReload.ts:37](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/ModelHotReload.ts#L37)

Resultado de [hotReloadModel](../functions/hotReloadModel.md).

## Properties

### skipped

> **skipped**: `object`[]

Defined in: [src/scene/ModelHotReload.ts:43](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/ModelHotReload.ts#L43)

Raízes puladas (animadas ou presas a ECS), com o motivo legível.

#### reason

> **reason**: `string`

***

### swapped

> **swapped**: `number`

Defined in: [src/scene/ModelHotReload.ts:41](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/ModelHotReload.ts#L41)

Quantas raízes trocaram de filhos.

***

### url

> **url**: `string`

Defined in: [src/scene/ModelHotReload.ts:39](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/ModelHotReload.ts#L39)

URL normalizada do GLB.
