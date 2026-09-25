[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / VehicleAnimatorOptions

# Interface: VehicleAnimatorOptions

Defined in: src/components/VehicleAnimatorComponent.ts:66

Opções do [VehicleAnimatorComponent](../classes/VehicleAnimatorComponent.md).

## Properties

### clipMap?

> `optional` **clipMap?**: `Partial`\<`Record`\<`"accelerate"` \| `"brake"` \| `"idle"` \| `"steer_left"` \| `"steer_right"` \| `"drift_left"` \| `"drift_right"` \| `"victory"`, `string`\>\>

Defined in: src/components/VehicleAnimatorComponent.ts:68

Estado → nome do clipe. Default: o próprio nome do estado.

***

### crossFade?

> `optional` **crossFade?**: `number`

Defined in: src/components/VehicleAnimatorComponent.ts:72

Duração do crossfade, em segundos. Default `0.25`.

***

### params?

> `optional` **params?**: [`VehicleDriveParams`](VehicleDriveParams.md)

Defined in: src/components/VehicleAnimatorComponent.ts:70

Parâmetros compartilhados. Default: um objeto novo zerado.

***

### thresholds?

> `optional` **thresholds?**: `Partial`\<[`VehicleAnimThresholds`](VehicleAnimThresholds.md)\>

Defined in: src/components/VehicleAnimatorComponent.ts:74

Limiares da escolha de estado.
