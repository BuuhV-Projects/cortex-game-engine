[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / BodySpec

# Interface: BodySpec

Defined in: src/physics/RapierPhysics.ts:42

Spec declarativa de um corpo (vira RigidBody + Collider no Rapier).

## Properties

### friction?

> `optional` **friction?**: `number`

Defined in: src/physics/RapierPhysics.ts:52

Atrito.

***

### isSensor?

> `optional` **isSensor?**: `boolean`

Defined in: src/physics/RapierPhysics.ts:54

`true` = trigger (detecta sobreposição mas NÃO bloqueia).

***

### position?

> `optional` **position?**: [`Vec3Like`](Vec3Like.md)

Defined in: src/physics/RapierPhysics.ts:46

Posição inicial. Default origem.

***

### restitution?

> `optional` **restitution?**: `number`

Defined in: src/physics/RapierPhysics.ts:50

Quão "quicante" (0 = não quica).

***

### shape

> **shape**: [`PhysicsShape`](../type-aliases/PhysicsShape.md)

Defined in: src/physics/RapierPhysics.ts:48

Forma do collider.

***

### type

> **type**: `"dynamic"` \| `"fixed"` \| `"kinematic"`

Defined in: src/physics/RapierPhysics.ts:44

`dynamic` cai/é empurrado; `fixed` é imóvel (chão/parede); `kinematic` você move.
