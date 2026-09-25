[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / VehicleAnimThresholds

# Interface: VehicleAnimThresholds

Defined in: src/components/VehicleAnimatorComponent.ts:43

Limiares da escolha de estado (ver `deriveVehicleAnimState`).

## Properties

### drift

> **drift**: `number`

Defined in: src/components/VehicleAnimatorComponent.ts:49

`|drift|` a partir do qual é drift.

***

### minDriftSpeed

> **minDriftSpeed**: `number`

Defined in: src/components/VehicleAnimatorComponent.ts:51

Velocidade mínima (m/s) para drift — parado não se derrapa.

***

### pedal

> **pedal**: `number`

Defined in: src/components/VehicleAnimatorComponent.ts:45

Acelerador/freio a partir do qual o pedal conta.

***

### steer

> **steer**: `number`

Defined in: src/components/VehicleAnimatorComponent.ts:47

`|steer|` a partir do qual o piloto esterça.
