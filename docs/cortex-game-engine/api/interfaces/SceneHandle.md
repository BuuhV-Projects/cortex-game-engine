[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / SceneHandle

# Interface: SceneHandle

Defined in: [src/scene/SceneBuilder.ts:39](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L39)

Handle da cena construída.

## Properties

### byId

> **byId**: `Map`\<`string`, `Object3D`\<`Object3DEventMap`\>\>

Defined in: [src/scene/SceneBuilder.ts:41](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L41)

Objetos instanciados, por `id`.

## Methods

### update()

> **update**(`deltaSeconds`): `void`

Defined in: [src/scene/SceneBuilder.ts:43](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L43)

Chame no loop com dt em **segundos** — anima águas (cáusticas).

#### Parameters

##### deltaSeconds

`number`

#### Returns

`void`
