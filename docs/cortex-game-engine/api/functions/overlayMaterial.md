[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / overlayMaterial

# Function: overlayMaterial()

> **overlayMaterial**(`overlay`): `Record`\<`string`, [`MaterialConfig`](../type-aliases/MaterialConfig.md)\>

Defined in: [src/scene/SceneBuilder.ts:277](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L277)

Lê `data.material` da overlay — o material/shader **autorado no editor** por id
(`{ [id]: MaterialConfig }`, ADR-0058). Sobrescreve o `material` do nó (JSON).
Ausência = sem opinião (cai pro nó). Ver [applyMaterial](applyMaterial.md).

## Parameters

### overlay

[`SceneFileV1`](../interfaces/SceneFileV1.md) \| `null` \| `undefined`

## Returns

`Record`\<`string`, [`MaterialConfig`](../type-aliases/MaterialConfig.md)\>
