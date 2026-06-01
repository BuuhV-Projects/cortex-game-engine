[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / VehiclePhysicsOptions

# Interface: VehiclePhysicsOptions

Defined in: [src/physics/VehiclePhysics.ts:15](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/VehiclePhysics.ts#L15)

Opções do [VehiclePhysics](../classes/VehiclePhysics.md).

## Properties

### gravity?

> `optional` **gravity?**: [`VehicleGravityOptions`](VehicleGravityOptions.md)

Defined in: [src/physics/VehiclePhysics.ts:17](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/VehiclePhysics.ts#L17)

Opções do sistema de gravidade + ground-snap.

***

### pauseWhen?

> `optional` **pauseWhen?**: () => `boolean`

Defined in: [src/physics/VehiclePhysics.ts:24](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/VehiclePhysics.ts#L24)

`pauseWhen` compartilhado, aplicado aos dois sistemas (ex.: pausar tudo no
modo editor). Um `pauseWhen` específico em `gravity`/`wall` tem precedência.

#### Returns

`boolean`

***

### wall?

> `optional` **wall?**: [`VehicleWallCollisionOptions`](VehicleWallCollisionOptions.md)

Defined in: [src/physics/VehiclePhysics.ts:19](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/VehiclePhysics.ts#L19)

Opções do sistema de colisão lateral (deslize).
