[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / VehicleControlOptions

# Interface: VehicleControlOptions

Defined in: [src/systems/VehicleControlSystem.ts:9](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L9)

Opções do [VehicleControlSystem](../classes/VehicleControlSystem.md).

## Properties

### active?

> `optional` **active?**: () => `boolean`

Defined in: [src/systems/VehicleControlSystem.ts:24](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L24)

Só dirige/posiciona a câmera quando `true` (ex.: `() => car.driving`). Default sempre.

#### Returns

`boolean`

***

### camDistance?

> `optional` **camDistance?**: `number`

Defined in: [src/systems/VehicleControlSystem.ts:21](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L21)

Câmera chase: distância e altura. Default 8 / 3.5.

***

### camHeight?

> `optional` **camHeight?**: `number`

Defined in: [src/systems/VehicleControlSystem.ts:22](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L22)

***

### engineForce?

> `optional` **engineForce?**: `number`

Defined in: [src/systems/VehicleControlSystem.ts:11](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L11)

Força do motor (N) com RT no talo. Default 9000.

***

### maxBrake?

> `optional` **maxBrake?**: `number`

Defined in: [src/systems/VehicleControlSystem.ts:15](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L15)

Freio máximo (LT andando pra frente). Default 50.

***

### maxSteer?

> `optional` **maxSteer?**: `number`

Defined in: [src/systems/VehicleControlSystem.ts:17](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L17)

Esterço máximo (rad). Default 0.55.

***

### pauseWhen?

> `optional` **pauseWhen?**: () => `boolean`

Defined in: [src/systems/VehicleControlSystem.ts:26](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L26)

Pausa total (ex.: `() => game.editorActive`).

#### Returns

`boolean`

***

### reverseForce?

> `optional` **reverseForce?**: `number`

Defined in: [src/systems/VehicleControlSystem.ts:13](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L13)

Força de ré com LT parado. Default `engineForce * 0.45`.

***

### steerSmooth?

> `optional` **steerSmooth?**: `number`

Defined in: [src/systems/VehicleControlSystem.ts:19](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L19)

Suavização do esterço (1/s). Default 8.
