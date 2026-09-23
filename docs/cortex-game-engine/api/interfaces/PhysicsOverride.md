[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / PhysicsOverride

# Interface: PhysicsOverride

Defined in: [jge-present/src/scene/SceneBuilder.ts:201](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L201)

Override de física por objeto (overlay `data.physics[nome]`).

## Properties

### character?

> `optional` **character?**: `object`

Defined in: [jge-present/src/scene/SceneBuilder.ts:204](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L204)

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

### rapier?

> `optional` **rapier?**: `object`

Defined in: [jge-present/src/scene/SceneBuilder.ts:206](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L206)

Parâmetros quando `type === 'rigid'` (corpo Rapier).

#### bodyType?

> `optional` **bodyType?**: `"dynamic"` \| `"fixed"` \| `"kinematic"`

#### friction?

> `optional` **friction?**: `number`

#### isSensor?

> `optional` **isSensor?**: `boolean`

#### restitution?

> `optional` **restitution?**: `number`

#### shape?

> `optional` **shape?**: \{ `kind`: `"auto"`; \} \| \{ `halfExtents`: \{ `x`: `number`; `y`: `number`; `z`: `number`; \}; `kind`: `"box"`; \} \| \{ `kind`: `"ball"`; `radius`: `number`; \} \| \{ `halfHeight`: `number`; `kind`: `"capsule"`; `radius`: `number`; \}

***

### type

> **type**: [`BodyType`](../type-aliases/BodyType.md)

Defined in: [jge-present/src/scene/SceneBuilder.ts:202](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L202)
