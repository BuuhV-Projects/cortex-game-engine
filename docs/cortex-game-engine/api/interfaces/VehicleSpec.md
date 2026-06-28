[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / VehicleSpec

# Interface: VehicleSpec

Defined in: [src/physics/RapierPhysics.ts:77](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L77)

Config de [RapierPhysics.createVehicle](../classes/RapierPhysics.md#createvehicle) (ADR-0081).

## Properties

### chassisFriction?

> `optional` **chassisFriction?**: `number`

Defined in: [src/physics/RapierPhysics.ts:91](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L91)

Atrito do chassi ao raspar. Default 0.4.

***

### chassisHalfExtents

> **chassisHalfExtents**: [`Vec3Like`](Vec3Like.md)

Defined in: [src/physics/RapierPhysics.ts:80](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L80)

Meia-extensão do chassi (box collider) — ex.: carro 4.85×1.4×2.27 → {2.42,0.7,1.13}.

***

### chassisOffset?

> `optional` **chassisOffset?**: [`Vec3Like`](Vec3Like.md)

Defined in: [src/physics/RapierPhysics.ts:87](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L87)

Desloca a CAIXA do chassi em relação à origem do corpo (= origem do `.glb`).
**Importante:** se a origem do modelo fica embaixo (nas rodas), suba a caixa
(`{x:0,y:~0.6,z:0}`) pra ela ficar ACIMA das rodas — senão a caixa encosta no chão
antes das rodas e o carro **flutua**. Default `{0,0,0}`.

***

### frictionSlip?

> `optional` **frictionSlip?**: `number`

Defined in: [src/physics/RapierPhysics.ts:100](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L100)

Grip lateral/longitudinal. Maior = mais aderente (arcade). Default 2.5.

***

### mass?

> `optional` **mass?**: `number`

Defined in: [src/physics/RapierPhysics.ts:89](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L89)

Massa do chassi (kg). Default 1200.

***

### maxSuspensionTravel?

> `optional` **maxSuspensionTravel?**: `number`

Defined in: [src/physics/RapierPhysics.ts:98](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L98)

***

### position?

> `optional` **position?**: [`Vec3Like`](Vec3Like.md)

Defined in: [src/physics/RapierPhysics.ts:78](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L78)

***

### suspensionCompression?

> `optional` **suspensionCompression?**: `number`

Defined in: [src/physics/RapierPhysics.ts:96](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L96)

***

### suspensionRelaxation?

> `optional` **suspensionRelaxation?**: `number`

Defined in: [src/physics/RapierPhysics.ts:97](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L97)

***

### suspensionRestLength?

> `optional` **suspensionRestLength?**: `number`

Defined in: [src/physics/RapierPhysics.ts:94](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L94)

***

### suspensionStiffness?

> `optional` **suspensionStiffness?**: `number`

Defined in: [src/physics/RapierPhysics.ts:95](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L95)

***

### wheels

> **wheels**: [`VehicleWheelSpec`](VehicleWheelSpec.md)[]

Defined in: [src/physics/RapierPhysics.ts:93](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L93)

As rodas (tipicamente 4: FL/FR dianteiras steering, RL/RR traseiras powered).
