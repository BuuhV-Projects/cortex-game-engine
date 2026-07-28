[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / VehicleWheelSpec

# Interface: VehicleWheelSpec

Defined in: [.claude/worktrees/feat-input-rebind/src/physics/RapierPhysics.ts:65](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L65)

Uma roda do [Vehicle](../classes/Vehicle.md) (posição relativa ao chassi + flags).

## Properties

### gripScale?

> `optional` **gripScale?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/physics/RapierPhysics.ts:75](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L75)

Multiplica o grip desta roda (ex.: traseira 0.7 = escapa mais → sobreesterço). Default 1.

***

### position

> **position**: [`Vec3Like`](Vec3Like.md)

Defined in: [.claude/worktrees/feat-input-rebind/src/physics/RapierPhysics.ts:67](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L67)

Posição da roda relativa ao centro do chassi.

***

### powered?

> `optional` **powered?**: `boolean`

Defined in: [.claude/worktrees/feat-input-rebind/src/physics/RapierPhysics.ts:73](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L73)

Tem tração (motor)?

***

### radius

> **radius**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/physics/RapierPhysics.ts:69](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L69)

Raio da roda (m).

***

### steering?

> `optional` **steering?**: `boolean`

Defined in: [.claude/worktrees/feat-input-rebind/src/physics/RapierPhysics.ts:71](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/RapierPhysics.ts#L71)

Esterça? (dianteiras = `true`).
