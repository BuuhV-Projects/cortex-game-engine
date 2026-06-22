[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / SceneHandle

# Interface: SceneHandle

Defined in: [src/scene/SceneBuilder.ts:89](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L89)

Handle da cena construída.

## Properties

### byId

> **byId**: `Map`\<`string`, `Object3D`\<`Object3DEventMap`\>\>

Defined in: [src/scene/SceneBuilder.ts:91](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L91)

Objetos instanciados, por `id`.

## Methods

### update()

> **update**(`deltaSeconds`): `void`

Defined in: [src/scene/SceneBuilder.ts:93](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L93)

Chame no loop com dt em **segundos** — anima águas (cáusticas).

#### Parameters

##### deltaSeconds

`number`

#### Returns

`void`
