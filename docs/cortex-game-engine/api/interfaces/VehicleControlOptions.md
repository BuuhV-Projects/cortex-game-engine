[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / VehicleControlOptions

# Interface: VehicleControlOptions

Defined in: [src/systems/VehicleControlSystem.ts:9](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L9)

Opções do [VehicleControlSystem](../classes/VehicleControlSystem.md).

## Properties

### active?

> `optional` **active?**: () => `boolean`

Defined in: [src/systems/VehicleControlSystem.ts:63](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L63)

Só dirige/posiciona a câmera quando `true` (ex.: `() => car.driving`). Default sempre.

#### Returns

`boolean`

***

### camDistance?

> `optional` **camDistance?**: `number`

Defined in: [src/systems/VehicleControlSystem.ts:50](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L50)

Câmera chase: distância e altura. Default 8 / 3.5.

***

### camFollowRate?

> `optional` **camFollowRate?**: `number`

Defined in: [src/systems/VehicleControlSystem.ts:59](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L59)

Quão rápido a câmera recentra atrás ao dirigir (1/s). Default 2.

***

### camHeight?

> `optional` **camHeight?**: `number`

Defined in: [src/systems/VehicleControlSystem.ts:51](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L51)

***

### engineForce?

> `optional` **engineForce?**: `number`

Defined in: [src/systems/VehicleControlSystem.ts:11](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L11)

Força do motor (N) com acelerador no talo. Default 5000.

***

### handbrakeForce?

> `optional` **handbrakeForce?**: `number`

Defined in: [src/systems/VehicleControlSystem.ts:21](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L21)

Freio de mão (Espaço/A) — trava as rodas. Default 120 (mais forte que o freio normal).

***

### invertLookY?

> `optional` **invertLookY?**: `boolean`

Defined in: [src/systems/VehicleControlSystem.ts:57](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L57)

Inverte o eixo Y do olhar. Default false.

***

### lookSensitivity?

> `optional` **lookSensitivity?**: `number`

Defined in: [src/systems/VehicleControlSystem.ts:53](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L53)

Sensibilidade do mouse pra orbitar a câmera (rad/px). Default 0.0022.

***

### maxBrake?

> `optional` **maxBrake?**: `number`

Defined in: [src/systems/VehicleControlSystem.ts:19](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L19)

Freio máximo (LT andando pra frente). Default 50.

***

### maxReverseSpeed?

> `optional` **maxReverseSpeed?**: `number`

Defined in: [src/systems/VehicleControlSystem.ts:15](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L15)

Velocidade MÁXIMA de ré (m/s). Default 8.33 (~30 km/h).

***

### maxSpeedKmh?

> `optional` **maxSpeedKmh?**: `number`

Defined in: [src/systems/VehicleControlSystem.ts:17](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L17)

Velocidade MÁXIMA pra frente (km/h) — limita o carro (e o ponteiro). Default sem limite.

***

### maxSteer?

> `optional` **maxSteer?**: `number`

Defined in: [src/systems/VehicleControlSystem.ts:30](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L30)

Esterço máximo (rad). Default 0.7.

***

### padLookSpeed?

> `optional` **padLookSpeed?**: `number`

Defined in: [src/systems/VehicleControlSystem.ts:55](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L55)

Velocidade de órbita pelo 2º stick (rad/s). Default 2.5.

***

### pauseWhen?

> `optional` **pauseWhen?**: () => `boolean`

Defined in: [src/systems/VehicleControlSystem.ts:65](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L65)

Pausa total (ex.: `() => game.editorActive`).

#### Returns

`boolean`

***

### recenterDelay?

> `optional` **recenterDelay?**: `number`

Defined in: [src/systems/VehicleControlSystem.ts:61](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L61)

Tempo sem olhar (s) até começar a recentrar atrás. Default 1.2.

***

### reverseForce?

> `optional` **reverseForce?**: `number`

Defined in: [src/systems/VehicleControlSystem.ts:13](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L13)

Força de ré (acelera de ré). Default `engineForce * 0.7`.

***

### rollingResistance?

> `optional` **rollingResistance?**: `number`

Defined in: [src/systems/VehicleControlSystem.ts:26](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L26)

Freio de **resistência ao rolamento / freio-motor** aplicado ao soltar acelerador e
freio (senão o carro não desacelera). Default 4.

***

### steerSmooth?

> `optional` **steerSmooth?**: `number`

Defined in: [src/systems/VehicleControlSystem.ts:32](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L32)

Suavização do esterço (1/s). Default 8.

***

### steerSpeedReduction?

> `optional` **steerSpeedReduction?**: `number`

Defined in: [src/systems/VehicleControlSystem.ts:37](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L37)

Reduz o esterço na velocidade (0..1) — curva mais suave rápido, **anti-capotamento**.
Ex.: 0.5 = perde metade do esterço a partir de `steerSpeedRef`. Default 0.5.

***

### steerSpeedRef?

> `optional` **steerSpeedRef?**: `number`

Defined in: [src/systems/VehicleControlSystem.ts:39](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L39)

Velocidade (m/s) em que a redução de esterço chega ao máximo. Default 28.

***

### throttleSmooth?

> `optional` **throttleSmooth?**: `number`

Defined in: [src/systems/VehicleControlSystem.ts:28](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L28)

Suavização do acelerador (1/s) — evita arranque brusco/empinada. Default 3.

***

### uprightDamping?

> `optional` **uprightDamping?**: `number`

Defined in: [src/systems/VehicleControlSystem.ts:43](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L43)

Amortecimento da rolagem (anti-capotamento). Default 7.

***

### uprightStrength?

> `optional` **uprightStrength?**: `number`

Defined in: [src/systems/VehicleControlSystem.ts:41](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L41)

Força do estabilizador anti-capotamento (puxa o carro pra cima). 0 = desliga. Default 14.

***

### wheelObjects?

> `optional` **wheelObjects?**: `Object3D`\<`Object3DEventMap`\>[]

Defined in: [src/systems/VehicleControlSystem.ts:48](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L48)

Malhas das rodas (na ORDEM das rodas do veículo) — sincronizadas a cada frame
(suspensão sobe/desce, esterço, rolagem). Devem ser filhas do `car`.
