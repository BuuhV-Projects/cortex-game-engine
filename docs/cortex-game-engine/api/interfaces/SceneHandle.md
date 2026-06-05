[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / SceneHandle

# Interface: SceneHandle

Defined in: src/scene/SceneBuilder.ts:33

Handle da cena construída.

## Properties

### byId

> **byId**: `Map`\<`string`, `Object3D`\<`Object3DEventMap`\>\>

Defined in: src/scene/SceneBuilder.ts:35

Objetos instanciados, por `id`.

## Methods

### update()

> **update**(`deltaSeconds`): `void`

Defined in: src/scene/SceneBuilder.ts:37

Chame no loop com dt em **segundos** — anima águas (cáusticas).

#### Parameters

##### deltaSeconds

`number`

#### Returns

`void`
