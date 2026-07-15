[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / overlayAnimation

# Function: overlayAnimation()

> **overlayAnimation**(`overlay`): `Record`\<`string`, [`AnimationConfig`](../type-aliases/AnimationConfig.md)\>

Defined in: [src/scene/SceneBuilder.ts:388](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L388)

Lê `data.animation` da overlay — a animação **autorada no editor** por id
(`{ [id]: { clip?, loop?, speed?, autoplay? } }`). Sobrescreve o `animation` do
nó (JSON), que por sua vez vence o código. Ver [SceneAnimator](../classes/SceneAnimator.md).

## Parameters

### overlay

[`SceneFileV1`](../interfaces/SceneFileV1.md) \| `null` \| `undefined`

## Returns

`Record`\<`string`, [`AnimationConfig`](../type-aliases/AnimationConfig.md)\>
