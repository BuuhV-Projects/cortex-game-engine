[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / GamepadState

# Interface: GamepadState

Defined in: [src/core/GamepadManager.ts:24](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GamepadManager.ts#L24)

Snapshot do estado de um gamepad em um determinado momento.
Retornado por `getGamepad()`. Os arrays são cópias — mutar não afeta o
estado interno.

## Properties

### axes

> **axes**: `number`[]

Defined in: [src/core/GamepadManager.ts:36](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GamepadManager.ts#L36)

Valor de cada eixo já com deadzone aplicada (-1.0 .. 1.0).

***

### buttons

> **buttons**: `boolean`[]

Defined in: [src/core/GamepadManager.ts:32](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GamepadManager.ts#L32)

Estado de cada botão (`true` = pressionado).

***

### connected

> **connected**: `boolean`

Defined in: [src/core/GamepadManager.ts:30](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GamepadManager.ts#L30)

`true` enquanto o dispositivo estiver conectado.

***

### id

> **id**: `string`

Defined in: [src/core/GamepadManager.ts:28](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GamepadManager.ts#L28)

Identificador do dispositivo (vendor/product).

***

### index

> **index**: `number`

Defined in: [src/core/GamepadManager.ts:26](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GamepadManager.ts#L26)

Índice do slot (0..3).

***

### values

> **values**: `number`[]

Defined in: [src/core/GamepadManager.ts:34](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GamepadManager.ts#L34)

Valor analógico de cada botão (0..1) — útil pros gatilhos LT/RT.
