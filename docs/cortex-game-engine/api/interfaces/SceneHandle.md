[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / SceneHandle

# Interface: SceneHandle

Defined in: [src/scene/SceneBuilder.ts:77](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L77)

Handle da cena construída.

## Properties

### byId

> **byId**: `Map`\<`string`, `Object3D`\<`Object3DEventMap`\>\>

Defined in: [src/scene/SceneBuilder.ts:79](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L79)

Objetos instanciados, por `id`.

## Methods

### update()

> **update**(`deltaSeconds`): `void`

Defined in: [src/scene/SceneBuilder.ts:81](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L81)

Chame no loop com dt em **segundos** — anima águas (cáusticas).

#### Parameters

##### deltaSeconds

`number`

#### Returns

`void`
