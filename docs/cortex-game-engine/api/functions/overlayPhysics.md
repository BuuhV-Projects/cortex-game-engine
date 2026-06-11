[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / overlayPhysics

# Function: overlayPhysics()

> **overlayPhysics**(`overlay`): `Record`\<`string`, [`PhysicsOverride`](../interfaces/PhysicsOverride.md)\>

Defined in: [src/scene/SceneBuilder.ts:194](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L194)

Lê `data.physics` da overlay — o **tipo de corpo autorado no Inspector** por
nome de objeto (`{ [nome]: { type: 'none'|'static'|'character', ... } }`). É a
fonte **autoritativa** (sobrescreve o que o código/`level.json` declara): permite
REMOVER um collider cravado no código (`type: 'none'`), trocar pra `character`,
etc. — pra a física ficar sempre visível/editável no Inspector (ADR-0058).

## Parameters

### overlay

[`SceneFileV1`](../interfaces/SceneFileV1.md) \| `null` \| `undefined`

## Returns

`Record`\<`string`, [`PhysicsOverride`](../interfaces/PhysicsOverride.md)\>
