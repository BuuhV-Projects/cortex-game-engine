[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / overlayColliders

# Function: overlayColliders()

> **overlayColliders**(`overlay`): `Record`\<`string`, [`ColliderConfig`](../type-aliases/ColliderConfig.md)\>

Defined in: [src/scene/SceneBuilder.ts:120](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L120)

Lê `data.colliders` da overlay — colliders **autorados no editor**, por nome de
objeto (`{ [nome]: { width?, height?, offsetX?, offsetY?, solid?, oneWay? } }`).
São aplicados pelo `buildScene` aos objetos que **não** têm collider no código
(o `node.collider` vence). Validação leve: campos numéricos/booleanos só.

## Parameters

### overlay

[`SceneFileV1`](../interfaces/SceneFileV1.md) \| `null` \| `undefined`

## Returns

`Record`\<`string`, [`ColliderConfig`](../type-aliases/ColliderConfig.md)\>
