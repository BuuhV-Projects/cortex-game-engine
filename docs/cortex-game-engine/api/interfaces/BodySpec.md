[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / BodySpec

# Interface: BodySpec

Defined in: [src/physics/RapierPhysics.ts:59](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L59)

Spec declarativa de um corpo (vira RigidBody + Collider no Rapier).

## Properties

### friction?

> `optional` **friction?**: `number`

Defined in: [src/physics/RapierPhysics.ts:69](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L69)

Atrito.

***

### isSensor?

> `optional` **isSensor?**: `boolean`

Defined in: [src/physics/RapierPhysics.ts:71](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L71)

`true` = trigger (detecta sobreposição mas NÃO bloqueia).

***

### position?

> `optional` **position?**: [`Vec3Like`](Vec3Like.md)

Defined in: [src/physics/RapierPhysics.ts:63](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L63)

Posição inicial. Default origem.

***

### restitution?

> `optional` **restitution?**: `number`

Defined in: [src/physics/RapierPhysics.ts:67](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L67)

Quão "quicante" (0 = não quica).

***

### shape

> **shape**: [`PhysicsShape`](../type-aliases/PhysicsShape.md)

Defined in: [src/physics/RapierPhysics.ts:65](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L65)

Forma do collider.

***

### type

> **type**: `"dynamic"` \| `"fixed"` \| `"kinematic"`

Defined in: [src/physics/RapierPhysics.ts:61](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L61)

`dynamic` cai/é empurrado; `fixed` é imóvel (chão/parede); `kinematic` você move.
