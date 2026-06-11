[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / BodySpec

# Interface: BodySpec

Defined in: [src/physics/RapierPhysics.ts:48](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L48)

Spec declarativa de um corpo (vira RigidBody + Collider no Rapier).

## Properties

### friction?

> `optional` **friction?**: `number`

Defined in: [src/physics/RapierPhysics.ts:58](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L58)

Atrito.

***

### isSensor?

> `optional` **isSensor?**: `boolean`

Defined in: [src/physics/RapierPhysics.ts:60](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L60)

`true` = trigger (detecta sobreposição mas NÃO bloqueia).

***

### position?

> `optional` **position?**: [`Vec3Like`](Vec3Like.md)

Defined in: [src/physics/RapierPhysics.ts:52](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L52)

Posição inicial. Default origem.

***

### restitution?

> `optional` **restitution?**: `number`

Defined in: [src/physics/RapierPhysics.ts:56](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L56)

Quão "quicante" (0 = não quica).

***

### shape

> **shape**: [`PhysicsShape`](../type-aliases/PhysicsShape.md)

Defined in: [src/physics/RapierPhysics.ts:54](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L54)

Forma do collider.

***

### type

> **type**: `"dynamic"` \| `"fixed"` \| `"kinematic"`

Defined in: [src/physics/RapierPhysics.ts:50](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L50)

`dynamic` cai/é empurrado; `fixed` é imóvel (chão/parede); `kinematic` você move.
