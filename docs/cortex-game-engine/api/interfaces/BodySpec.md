[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / BodySpec

# Interface: BodySpec

Defined in: [src/physics/RapierPhysics.ts:49](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L49)

Spec declarativa de um corpo (vira RigidBody + Collider no Rapier).

## Properties

### friction?

> `optional` **friction?**: `number`

Defined in: [src/physics/RapierPhysics.ts:59](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L59)

Atrito.

***

### isSensor?

> `optional` **isSensor?**: `boolean`

Defined in: [src/physics/RapierPhysics.ts:61](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L61)

`true` = trigger (detecta sobreposição mas NÃO bloqueia).

***

### position?

> `optional` **position?**: [`Vec3Like`](Vec3Like.md)

Defined in: [src/physics/RapierPhysics.ts:53](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L53)

Posição inicial. Default origem.

***

### restitution?

> `optional` **restitution?**: `number`

Defined in: [src/physics/RapierPhysics.ts:57](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L57)

Quão "quicante" (0 = não quica).

***

### shape

> **shape**: [`PhysicsShape`](../type-aliases/PhysicsShape.md)

Defined in: [src/physics/RapierPhysics.ts:55](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L55)

Forma do collider.

***

### type

> **type**: `"dynamic"` \| `"fixed"` \| `"kinematic"`

Defined in: [src/physics/RapierPhysics.ts:51](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L51)

`dynamic` cai/é empurrado; `fixed` é imóvel (chão/parede); `kinematic` você move.
