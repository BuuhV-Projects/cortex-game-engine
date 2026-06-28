[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / VehicleSpec

# Interface: VehicleSpec

Defined in: [src/physics/RapierPhysics.ts:77](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L77)

Config de [RapierPhysics.createVehicle](../classes/RapierPhysics.md#createvehicle) (ADR-0081).

## Properties

### chassisFriction?

> `optional` **chassisFriction?**: `number`

Defined in: [src/physics/RapierPhysics.ts:84](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L84)

Atrito do chassi ao raspar. Default 0.4.

***

### chassisHalfExtents

> **chassisHalfExtents**: [`Vec3Like`](Vec3Like.md)

Defined in: [src/physics/RapierPhysics.ts:80](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L80)

Meia-extensão do chassi (box collider) — ex.: carro 4.85×1.4×2.27 → {2.42,0.7,1.13}.

***

### frictionSlip?

> `optional` **frictionSlip?**: `number`

Defined in: [src/physics/RapierPhysics.ts:93](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L93)

Grip lateral/longitudinal. Maior = mais aderente (arcade). Default 2.5.

***

### mass?

> `optional` **mass?**: `number`

Defined in: [src/physics/RapierPhysics.ts:82](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L82)

Massa do chassi (kg). Default 1200.

***

### maxSuspensionTravel?

> `optional` **maxSuspensionTravel?**: `number`

Defined in: [src/physics/RapierPhysics.ts:91](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L91)

***

### position?

> `optional` **position?**: [`Vec3Like`](Vec3Like.md)

Defined in: [src/physics/RapierPhysics.ts:78](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L78)

***

### suspensionCompression?

> `optional` **suspensionCompression?**: `number`

Defined in: [src/physics/RapierPhysics.ts:89](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L89)

***

### suspensionRelaxation?

> `optional` **suspensionRelaxation?**: `number`

Defined in: [src/physics/RapierPhysics.ts:90](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L90)

***

### suspensionRestLength?

> `optional` **suspensionRestLength?**: `number`

Defined in: [src/physics/RapierPhysics.ts:87](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L87)

***

### suspensionStiffness?

> `optional` **suspensionStiffness?**: `number`

Defined in: [src/physics/RapierPhysics.ts:88](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L88)

***

### wheels

> **wheels**: [`VehicleWheelSpec`](VehicleWheelSpec.md)[]

Defined in: [src/physics/RapierPhysics.ts:86](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L86)

As rodas (tipicamente 4: FL/FR dianteiras steering, RL/RR traseiras powered).
