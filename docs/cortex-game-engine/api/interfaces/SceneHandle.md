[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / SceneHandle

# Interface: SceneHandle

Defined in: [src/scene/SceneBuilder.ts:82](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L82)

Handle da cena construída.

## Properties

### byId

> **byId**: `Map`\<`string`, `Object3D`\<`Object3DEventMap`\>\>

Defined in: [src/scene/SceneBuilder.ts:84](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L84)

Objetos instanciados, por `id`.

## Methods

### update()

> **update**(`deltaSeconds`): `void`

Defined in: [src/scene/SceneBuilder.ts:86](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L86)

Chame no loop com dt em **segundos** — anima águas (cáusticas).

#### Parameters

##### deltaSeconds

`number`

#### Returns

`void`
