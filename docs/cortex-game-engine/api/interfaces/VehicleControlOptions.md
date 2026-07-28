[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / VehicleControlOptions

# Interface: VehicleControlOptions

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/VehicleControlSystem.ts:10](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L10)

Opções do [VehicleControlSystem](../classes/VehicleControlSystem.md).

## Properties

### actions?

> `optional` **actions?**: [`InputActions`](../classes/InputActions.md)

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/VehicleControlSystem.ts:73](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L73)

**Ações de input remapeáveis** (ADR-0164) — passe `game.actions` pra dirigir
pelas ações `accelerate`/`brake`/`handbrake` + `moveLeft`/`moveRight`
(grupo `vehicle` da tela de Controles). Sem isso, valem RT/LT/stick e o
fallback WASD fixos.

***

### active?

> `optional` **active?**: () => `boolean`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/VehicleControlSystem.ts:64](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L64)

Só dirige/posiciona a câmera quando `true` (ex.: `() => car.driving`). Default sempre.

#### Returns

`boolean`

***

### camDistance?

> `optional` **camDistance?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/VehicleControlSystem.ts:51](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L51)

Câmera chase: distância e altura. Default 8 / 3.5.

***

### camFollowRate?

> `optional` **camFollowRate?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/VehicleControlSystem.ts:60](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L60)

Quão rápido a câmera recentra atrás ao dirigir (1/s). Default 2.

***

### camHeight?

> `optional` **camHeight?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/VehicleControlSystem.ts:52](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L52)

***

### engineForce?

> `optional` **engineForce?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/VehicleControlSystem.ts:12](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L12)

Força do motor (N) com acelerador no talo. Default 5000.

***

### handbrakeForce?

> `optional` **handbrakeForce?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/VehicleControlSystem.ts:22](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L22)

Freio de mão (Espaço/A) — trava as rodas. Default 120 (mais forte que o freio normal).

***

### invertLookY?

> `optional` **invertLookY?**: `boolean`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/VehicleControlSystem.ts:58](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L58)

Inverte o eixo Y do olhar. Default false.

***

### lookSensitivity?

> `optional` **lookSensitivity?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/VehicleControlSystem.ts:54](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L54)

Sensibilidade do mouse pra orbitar a câmera (rad/px). Default 0.0022.

***

### maxBrake?

> `optional` **maxBrake?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/VehicleControlSystem.ts:20](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L20)

Freio máximo (LT andando pra frente). Default 50.

***

### maxReverseSpeed?

> `optional` **maxReverseSpeed?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/VehicleControlSystem.ts:16](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L16)

Velocidade MÁXIMA de ré (m/s). Default 8.33 (~30 km/h).

***

### maxSpeedKmh?

> `optional` **maxSpeedKmh?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/VehicleControlSystem.ts:18](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L18)

Velocidade MÁXIMA pra frente (km/h) — limita o carro (e o ponteiro). Default sem limite.

***

### maxSteer?

> `optional` **maxSteer?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/VehicleControlSystem.ts:31](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L31)

Esterço máximo (rad). Default 0.7.

***

### padLookSpeed?

> `optional` **padLookSpeed?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/VehicleControlSystem.ts:56](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L56)

Velocidade de órbita pelo 2º stick (rad/s). Default 2.5.

***

### pauseWhen?

> `optional` **pauseWhen?**: () => `boolean`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/VehicleControlSystem.ts:66](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L66)

Pausa total (ex.: `() => game.editorActive`).

#### Returns

`boolean`

***

### recenterDelay?

> `optional` **recenterDelay?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/VehicleControlSystem.ts:62](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L62)

Tempo sem olhar (s) até começar a recentrar atrás. Default 1.2.

***

### reverseForce?

> `optional` **reverseForce?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/VehicleControlSystem.ts:14](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L14)

Força de ré (acelera de ré). Default `engineForce * 0.7`.

***

### rollingResistance?

> `optional` **rollingResistance?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/VehicleControlSystem.ts:27](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L27)

Freio de **resistência ao rolamento / freio-motor** aplicado ao soltar acelerador e
freio (senão o carro não desacelera). Default 4.

***

### steerSmooth?

> `optional` **steerSmooth?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/VehicleControlSystem.ts:33](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L33)

Suavização do esterço (1/s). Default 8.

***

### steerSpeedReduction?

> `optional` **steerSpeedReduction?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/VehicleControlSystem.ts:38](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L38)

Reduz o esterço na velocidade (0..1) — curva mais suave rápido, **anti-capotamento**.
Ex.: 0.5 = perde metade do esterço a partir de `steerSpeedRef`. Default 0.5.

***

### steerSpeedRef?

> `optional` **steerSpeedRef?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/VehicleControlSystem.ts:40](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L40)

Velocidade (m/s) em que a redução de esterço chega ao máximo. Default 28.

***

### throttleSmooth?

> `optional` **throttleSmooth?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/VehicleControlSystem.ts:29](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L29)

Suavização do acelerador (1/s) — evita arranque brusco/empinada. Default 3.

***

### uprightDamping?

> `optional` **uprightDamping?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/VehicleControlSystem.ts:44](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L44)

Amortecimento da rolagem (anti-capotamento). Default 7.

***

### uprightStrength?

> `optional` **uprightStrength?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/VehicleControlSystem.ts:42](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L42)

Força do estabilizador anti-capotamento (puxa o carro pra cima). 0 = desliga. Default 14.

***

### wheelObjects?

> `optional` **wheelObjects?**: `Object3D`\<`Object3DEventMap`\>[]

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/VehicleControlSystem.ts:49](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/VehicleControlSystem.ts#L49)

Malhas das rodas (na ORDEM das rodas do veículo) — sincronizadas a cada frame
(suspensão sobe/desce, esterço, rolagem). Devem ser filhas do `car`.
