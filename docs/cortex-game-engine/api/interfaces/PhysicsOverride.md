[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / PhysicsOverride

# Interface: PhysicsOverride

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/SceneBuilder.ts:153](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L153)

Override de física por objeto (overlay `data.physics[nome]`).

## Properties

### character?

> `optional` **character?**: `object`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/SceneBuilder.ts:156](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L156)

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

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/SceneBuilder.ts:158](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L158)

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

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/SceneBuilder.ts:154](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L154)
