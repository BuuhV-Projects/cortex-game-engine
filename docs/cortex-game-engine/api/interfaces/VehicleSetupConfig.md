[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / VehicleSetupConfig

# Interface: VehicleSetupConfig

Defined in: [src/scene/VehicleSetup.ts:31](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/VehicleSetup.ts#L31)

Config do [setupVehicle](../functions/setupVehicle.md) — layout do `.glb` (rodas/chassi) + tunáveis.

## Properties

### centerOfMass?

> `optional` **centerOfMass?**: `object`

Defined in: [src/scene/VehicleSetup.ts:34](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/VehicleSetup.ts#L34)

#### x

> **x**: `number`

#### y

> **y**: `number`

#### z

> **z**: `number`

***

### chassisHalfExtents

> **chassisHalfExtents**: `object`

Defined in: [src/scene/VehicleSetup.ts:32](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/VehicleSetup.ts#L32)

#### x

> **x**: `number`

#### y

> **y**: `number`

#### z

> **z**: `number`

***

### chassisOffset?

> `optional` **chassisOffset?**: `object`

Defined in: [src/scene/VehicleSetup.ts:33](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/VehicleSetup.ts#L33)

#### x

> **x**: `number`

#### y

> **y**: `number`

#### z

> **z**: `number`

***

### engineForce?

> `optional` **engineForce?**: `number`

Defined in: [src/scene/VehicleSetup.ts:42](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/VehicleSetup.ts#L42)

***

### engineLayers?

> `optional` **engineLayers?**: `object`

Defined in: [src/scene/VehicleSetup.ts:50](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/VehicleSetup.ts#L50)

#### offHigh?

> `optional` **offHigh?**: `string`

#### offLow?

> `optional` **offLow?**: `string`

#### offMid?

> `optional` **offMid?**: `string`

#### offVeryHigh?

> `optional` **offVeryHigh?**: `string`

#### onHigh?

> `optional` **onHigh?**: `string`

#### onLow?

> `optional` **onLow?**: `string`

#### onMid?

> `optional` **onMid?**: `string`

***

### frictionSlip?

> `optional` **frictionSlip?**: `number`

Defined in: [src/scene/VehicleSetup.ts:38](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/VehicleSetup.ts#L38)

***

### handbrakeForce?

> `optional` **handbrakeForce?**: `number`

Defined in: [src/scene/VehicleSetup.ts:44](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/VehicleSetup.ts#L44)

***

### mass?

> `optional` **mass?**: `number`

Defined in: [src/scene/VehicleSetup.ts:35](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/VehicleSetup.ts#L35)

***

### maxBrake?

> `optional` **maxBrake?**: `number`

Defined in: [src/scene/VehicleSetup.ts:43](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/VehicleSetup.ts#L43)

***

### maxReverseSpeed?

> `optional` **maxReverseSpeed?**: `number`

Defined in: [src/scene/VehicleSetup.ts:47](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/VehicleSetup.ts#L47)

***

### maxSpeedKmh?

> `optional` **maxSpeedKmh?**: `number`

Defined in: [src/scene/VehicleSetup.ts:49](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/VehicleSetup.ts#L49)

***

### maxSteer?

> `optional` **maxSteer?**: `number`

Defined in: [src/scene/VehicleSetup.ts:48](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/VehicleSetup.ts#L48)

***

### reverseForce?

> `optional` **reverseForce?**: `number`

Defined in: [src/scene/VehicleSetup.ts:46](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/VehicleSetup.ts#L46)

***

### rollingResistance?

> `optional` **rollingResistance?**: `number`

Defined in: [src/scene/VehicleSetup.ts:45](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/VehicleSetup.ts#L45)

***

### speedoMax?

> `optional` **speedoMax?**: `number`

Defined in: [src/scene/VehicleSetup.ts:52](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/VehicleSetup.ts#L52)

Máx. do velocímetro (km/h). Default 260.

***

### suspensionRestLength?

> `optional` **suspensionRestLength?**: `number`

Defined in: [src/scene/VehicleSetup.ts:36](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/VehicleSetup.ts#L36)

***

### suspensionStiffness?

> `optional` **suspensionStiffness?**: `number`

Defined in: [src/scene/VehicleSetup.ts:37](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/VehicleSetup.ts#L37)

***

### wheelNames?

> `optional` **wheelNames?**: `string`[]

Defined in: [src/scene/VehicleSetup.ts:41](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/VehicleSetup.ts#L41)

Nomes das malhas das rodas no `.glb`, na ordem de `wheels`. Default `['FL','FR','RL','RR']`.

***

### wheels

> **wheels**: [`VehicleWheelSpec`](VehicleWheelSpec.md)[]

Defined in: [src/scene/VehicleSetup.ts:39](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/VehicleSetup.ts#L39)
