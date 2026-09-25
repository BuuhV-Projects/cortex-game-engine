[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / VehicleDriverConfig

# Interface: VehicleDriverConfig

Defined in: src/scene/VehicleDriver.ts:95

Config do [setupVehicleDriver](../functions/setupVehicleDriver.md).

## Properties

### animator?

> `optional` **animator?**: `Omit`\<[`VehicleAnimatorOptions`](VehicleAnimatorOptions.md), `"params"`\>

Defined in: src/scene/VehicleDriver.ts:105

***

### clips

> **clips**: readonly `AnimationClip`[]

Defined in: src/scene/VehicleDriver.ts:101

Clipes do piloto (`gltf.animations`), baked com mãos/pés (sem IK).

***

### driver

> **driver**: `Object3D`

Defined in: src/scene/VehicleDriver.ts:99

Raiz do piloto (cena do GLB do piloto).

***

### params?

> `optional` **params?**: [`VehicleDriveParams`](VehicleDriveParams.md)

Defined in: src/scene/VehicleDriver.ts:108

Parâmetros compartilhados. Default: um objeto novo zerado.

***

### pauseWhen?

> `optional` **pauseWhen?**: () => `boolean`

Defined in: src/scene/VehicleDriver.ts:110

Pausa do sistema (ex.: `() => game.editorActive || game.gameplayPaused`).

#### Returns

`boolean`

***

### pose?

> `optional` **pose?**: [`DriverPoseOptions`](DriverPoseOptions.md)

Defined in: src/scene/VehicleDriver.ts:106

***

### seat?

> `optional` **seat?**: [`VehicleSeatOptions`](VehicleSeatOptions.md)

Defined in: src/scene/VehicleDriver.ts:104

***

### seatName?

> `optional` **seatName?**: `string`

Defined in: src/scene/VehicleDriver.ts:103

Anchor do assento. Default `'assento'`.

***

### vehicle

> **vehicle**: `Object3D`

Defined in: src/scene/VehicleDriver.ts:97

Raiz do veículo (cena do GLB do kart).
