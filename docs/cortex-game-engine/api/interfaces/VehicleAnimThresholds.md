[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / VehicleAnimThresholds

# Interface: VehicleAnimThresholds

Defined in: [src/components/VehicleAnimatorComponent.ts:43](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/VehicleAnimatorComponent.ts#L43)

Limiares da escolha de estado (ver `deriveVehicleAnimState`).

## Properties

### drift

> **drift**: `number`

Defined in: [src/components/VehicleAnimatorComponent.ts:49](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/VehicleAnimatorComponent.ts#L49)

`|drift|` a partir do qual é drift.

***

### minDriftSpeed

> **minDriftSpeed**: `number`

Defined in: [src/components/VehicleAnimatorComponent.ts:51](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/VehicleAnimatorComponent.ts#L51)

Velocidade mínima (m/s) para drift — parado não se derrapa.

***

### pedal

> **pedal**: `number`

Defined in: [src/components/VehicleAnimatorComponent.ts:45](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/VehicleAnimatorComponent.ts#L45)

Acelerador/freio a partir do qual o pedal conta.

***

### steer

> **steer**: `number`

Defined in: [src/components/VehicleAnimatorComponent.ts:47](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/components/VehicleAnimatorComponent.ts#L47)

`|steer|` a partir do qual o piloto esterça.
