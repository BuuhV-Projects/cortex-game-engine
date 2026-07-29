[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / overlayShadow

# Function: overlayShadow()

> **overlayShadow**(`overlay`): `Record`\<`string`, \{ `cast?`: `boolean`; `recv?`: `boolean`; \}\>

Defined in: [src/scene/SceneBuilder.ts:278](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L278)

Lê `data.shadow` da overlay — os toggles Projeta/Recebe sombra **autorados no
Inspector** por nome (`{ [nome]: { cast?, recv? } }`; campo ausente = sem
opinião, vale o nó/default). Aplicados pelo `buildScene` no boot.

## Parameters

### overlay

[`SceneFileV1`](../interfaces/SceneFileV1.md) \| `null` \| `undefined`

## Returns

`Record`\<`string`, \{ `cast?`: `boolean`; `recv?`: `boolean`; \}\>
