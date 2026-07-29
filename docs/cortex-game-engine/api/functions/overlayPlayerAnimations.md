[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / overlayPlayerAnimations

# Function: overlayPlayerAnimations()

> **overlayPlayerAnimations**(`overlay`): `Record`\<`string`, `Record`\<`string`, `string`\>\>

Defined in: [src/scene/SceneBuilder.ts:429](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L429)

Lê `data.playerAnimations` da overlay — o **mapa ação→clipe do player** autorado
no editor (`{ [id]: { idle, run, jump, … } }`). Sobrescreve o `animations` do nó.
Ver [PlayerAnimatorComponent](../classes/PlayerAnimatorComponent.md).

## Parameters

### overlay

[`SceneFileV1`](../interfaces/SceneFileV1.md) \| `null` \| `undefined`

## Returns

`Record`\<`string`, `Record`\<`string`, `string`\>\>
