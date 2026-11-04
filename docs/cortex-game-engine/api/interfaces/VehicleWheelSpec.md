[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / VehicleWheelSpec

# Interface: VehicleWheelSpec

Defined in: [src/physics/RapierPhysics.ts:75](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L75)

Uma roda do [Vehicle](../classes/Vehicle.md) (posição relativa ao chassi + flags).

## Properties

### gripScale?

> `optional` **gripScale?**: `number`

Defined in: [src/physics/RapierPhysics.ts:85](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L85)

Multiplica o grip desta roda (ex.: traseira 0.7 = escapa mais → sobreesterço). Default 1.

***

### position

> **position**: [`Vec3Like`](Vec3Like.md)

Defined in: [src/physics/RapierPhysics.ts:77](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L77)

Posição da roda relativa ao centro do chassi.

***

### powered?

> `optional` **powered?**: `boolean`

Defined in: [src/physics/RapierPhysics.ts:83](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L83)

Tem tração (motor)?

***

### radius

> **radius**: `number`

Defined in: [src/physics/RapierPhysics.ts:79](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L79)

Raio da roda (m).

***

### steering?

> `optional` **steering?**: `boolean`

Defined in: [src/physics/RapierPhysics.ts:81](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L81)

Esterça? (dianteiras = `true`).
