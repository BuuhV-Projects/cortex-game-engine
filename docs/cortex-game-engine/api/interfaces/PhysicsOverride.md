[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / PhysicsOverride

# Interface: PhysicsOverride

Defined in: [src/scene/SceneBuilder.ts:121](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L121)

Override de física por objeto (overlay `data.physics[nome]`).

## Properties

### character?

> `optional` **character?**: `object`

Defined in: [src/scene/SceneBuilder.ts:124](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L124)

Parâmetros quando `type === 'character'`.

#### fallSpeedMax?

> `optional` **fallSpeedMax?**: `number`

#### gravity?

> `optional` **gravity?**: `number`

#### groundY?

> `optional` **groundY?**: `number`

Piso plano de fallback (se não houver geometria embaixo). Default `0`. O chão principal é colisão real.

#### height?

> `optional` **height?**: `number`

#### jumpForce?

> `optional` **jumpForce?**: `number`

#### maxJumps?

> `optional` **maxJumps?**: `number`

#### radius?

> `optional` **radius?**: `number`

#### stepHeight?

> `optional` **stepHeight?**: `number`

***

### type

> **type**: [`BodyType`](../type-aliases/BodyType.md)

Defined in: [src/scene/SceneBuilder.ts:122](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L122)
