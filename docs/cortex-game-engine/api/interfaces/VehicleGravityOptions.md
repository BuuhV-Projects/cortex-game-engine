[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / VehicleGravityOptions

# Interface: VehicleGravityOptions

Defined in: [src/physics/VehicleGravitySystem.ts:10](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/VehicleGravitySystem.ts#L10)

Opções do [VehicleGravitySystem](../classes/VehicleGravitySystem.md).

## Properties

### fallThreshold?

> `optional` **fallThreshold?**: `number`

Defined in: [src/physics/VehicleGravitySystem.ts:22](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/VehicleGravitySystem.ts#L22)

Abaixo deste Y, considera-se que o veículo caiu do mapa. Default -1000.

***

### gravity?

> `optional` **gravity?**: `number`

Defined in: [src/physics/VehicleGravitySystem.ts:12](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/VehicleGravitySystem.ts#L12)

Aceleração da gravidade em unidades/s² (negativo = pra baixo). Default -25.

***

### onFallOff?

> `optional` **onFallOff?**: (`entity`) => `void`

Defined in: [src/physics/VehicleGravitySystem.ts:24](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/VehicleGravitySystem.ts#L24)

Chamado quando o veículo cai abaixo de `fallThreshold` (ex.: respawn).

#### Parameters

##### entity

[`Entity`](../classes/Entity.md)

#### Returns

`void`

***

### pauseWhen?

> `optional` **pauseWhen?**: () => `boolean`

Defined in: [src/physics/VehicleGravitySystem.ts:26](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/VehicleGravitySystem.ts#L26)

Quando retorna `true`, o sistema é pulado (ex.: modo editor).

#### Returns

`boolean`

***

### probeAbove?

> `optional` **probeAbove?**: `number`

Defined in: [src/physics/VehicleGravitySystem.ts:20](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/VehicleGravitySystem.ts#L20)

Quanto acima do veículo o raycast pra baixo começa. **Pequeno de propósito**
(2–3 un): valores grandes fazem o ray subir até pontes/coberturas acima e o
veículo é teleportado pra cima delas. Default 3.

***

### wheelRadius?

> `optional` **wheelRadius?**: `number`

Defined in: [src/physics/VehicleGravitySystem.ts:14](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/physics/VehicleGravitySystem.ts#L14)

Raio da roda — folga entre o ponto de contato e o centro lógico. Default 0.3.
