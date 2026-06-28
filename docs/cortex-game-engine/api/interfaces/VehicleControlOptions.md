[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / VehicleControlOptions

# Interface: VehicleControlOptions

Defined in: [src/systems/VehicleControlSystem.ts:9](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L9)

Opções do [VehicleControlSystem](../classes/VehicleControlSystem.md).

## Properties

### active?

> `optional` **active?**: () => `boolean`

Defined in: [src/systems/VehicleControlSystem.ts:46](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L46)

Só dirige/posiciona a câmera quando `true` (ex.: `() => car.driving`). Default sempre.

#### Returns

`boolean`

***

### camDistance?

> `optional` **camDistance?**: `number`

Defined in: [src/systems/VehicleControlSystem.ts:33](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L33)

Câmera chase: distância e altura. Default 8 / 3.5.

***

### camFollowRate?

> `optional` **camFollowRate?**: `number`

Defined in: [src/systems/VehicleControlSystem.ts:42](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L42)

Quão rápido a câmera recentra atrás ao dirigir (1/s). Default 2.

***

### camHeight?

> `optional` **camHeight?**: `number`

Defined in: [src/systems/VehicleControlSystem.ts:34](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L34)

***

### engineForce?

> `optional` **engineForce?**: `number`

Defined in: [src/systems/VehicleControlSystem.ts:11](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L11)

Força do motor (N) com acelerador no talo. Default 5000.

***

### invertLookY?

> `optional` **invertLookY?**: `boolean`

Defined in: [src/systems/VehicleControlSystem.ts:40](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L40)

Inverte o eixo Y do olhar. Default false.

***

### lookSensitivity?

> `optional` **lookSensitivity?**: `number`

Defined in: [src/systems/VehicleControlSystem.ts:36](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L36)

Sensibilidade do mouse pra orbitar a câmera (rad/px). Default 0.0022.

***

### maxBrake?

> `optional` **maxBrake?**: `number`

Defined in: [src/systems/VehicleControlSystem.ts:15](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L15)

Freio máximo (LT andando pra frente). Default 50.

***

### maxSteer?

> `optional` **maxSteer?**: `number`

Defined in: [src/systems/VehicleControlSystem.ts:24](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L24)

Esterço máximo (rad). Default 0.65.

***

### padLookSpeed?

> `optional` **padLookSpeed?**: `number`

Defined in: [src/systems/VehicleControlSystem.ts:38](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L38)

Velocidade de órbita pelo 2º stick (rad/s). Default 2.5.

***

### pauseWhen?

> `optional` **pauseWhen?**: () => `boolean`

Defined in: [src/systems/VehicleControlSystem.ts:48](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L48)

Pausa total (ex.: `() => game.editorActive`).

#### Returns

`boolean`

***

### recenterDelay?

> `optional` **recenterDelay?**: `number`

Defined in: [src/systems/VehicleControlSystem.ts:44](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L44)

Tempo sem olhar (s) até começar a recentrar atrás. Default 1.2.

***

### reverseForce?

> `optional` **reverseForce?**: `number`

Defined in: [src/systems/VehicleControlSystem.ts:13](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L13)

Força de ré com LT parado. Default `engineForce * 0.45`.

***

### rollingResistance?

> `optional` **rollingResistance?**: `number`

Defined in: [src/systems/VehicleControlSystem.ts:20](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L20)

Freio de **resistência ao rolamento / freio-motor** aplicado ao soltar acelerador e
freio (senão o carro não desacelera). Default 4.

***

### steerSmooth?

> `optional` **steerSmooth?**: `number`

Defined in: [src/systems/VehicleControlSystem.ts:26](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L26)

Suavização do esterço (1/s). Default 8.

***

### throttleSmooth?

> `optional` **throttleSmooth?**: `number`

Defined in: [src/systems/VehicleControlSystem.ts:22](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L22)

Suavização do acelerador (1/s) — evita arranque brusco/empinada. Default 3.

***

### wheelObjects?

> `optional` **wheelObjects?**: `Object3D`\<`Object3DEventMap`\>[]

Defined in: [src/systems/VehicleControlSystem.ts:31](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L31)

Malhas das rodas (na ORDEM das rodas do veículo) — sincronizadas a cada frame
(suspensão sobe/desce, esterço, rolagem). Devem ser filhas do `car`.
