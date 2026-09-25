[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / deriveVehicleAnimState

# Function: deriveVehicleAnimState()

> **deriveVehicleAnimState**(`p`, `t`): `"accelerate"` \| `"brake"` \| `"idle"` \| `"steer_left"` \| `"steer_right"` \| `"drift_left"` \| `"drift_right"` \| `"victory"`

Defined in: [src/systems/VehicleDriverSystem.ts:47](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleDriverSystem.ts#L47)

Estado de animação a partir dos parâmetros de direção. Precedência: drift
(com velocidade) > freio > esterço > acelerador > idle.

## Parameters

### p

[`VehicleDriveParams`](../interfaces/VehicleDriveParams.md)

### t

[`VehicleAnimThresholds`](../interfaces/VehicleAnimThresholds.md)

## Returns

`"accelerate"` \| `"brake"` \| `"idle"` \| `"steer_left"` \| `"steer_right"` \| `"drift_left"` \| `"drift_right"` \| `"victory"`
