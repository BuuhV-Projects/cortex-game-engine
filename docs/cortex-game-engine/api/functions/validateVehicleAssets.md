[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / validateVehicleAssets

# Function: validateVehicleAssets()

> **validateVehicleAssets**(`assets`): [`VehicleAssetReport`](../interfaces/VehicleAssetReport.md)

Defined in: [src/scene/VehicleDriver.ts:64](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/VehicleDriver.ts#L64)

Confere kart e piloto contra a convenção da SPEC-0275: anchors do veículo,
bones do piloto e clipes com os nomes dos estados. Não lança — devolve o
relatório (ver [formatVehicleAssetReport](formatVehicleAssetReport.md)).

## Parameters

### assets

#### clipMap?

`Partial`\<`Record`\<`"accelerate"` \| `"brake"` \| `"idle"` \| `"steer_left"` \| `"steer_right"` \| `"drift_left"` \| `"drift_right"` \| `"victory"`, `string`\>\>

Estado → nome do clipe, se o asset usa outros nomes.

#### clips

readonly `AnimationClip`[]

#### driver

`Object3D`

#### seatName?

`string`

Anchor do assento, se não for `'assento'`.

#### vehicle

`Object3D`

## Returns

[`VehicleAssetReport`](../interfaces/VehicleAssetReport.md)
