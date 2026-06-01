[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / GamepadManager

# Class: GamepadManager

Defined in: [src/core/GamepadManager.ts:67](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GamepadManager.ts#L67)

## Extends

- `EventTarget`

## Constructors

### Constructor

> **new GamepadManager**(`options?`): `GamepadManager`

Defined in: [src/core/GamepadManager.ts:71](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GamepadManager.ts#L71)

#### Parameters

##### options?

[`GamepadManagerOptions`](../interfaces/GamepadManagerOptions.md) = `{}`

#### Returns

`GamepadManager`

#### Overrides

`EventTarget.constructor`

## Accessors

### deadzone

#### Get Signature

> **get** **deadzone**(): `number`

Defined in: [src/core/GamepadManager.ts:211](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GamepadManager.ts#L211)

Limiar de deadzone configurado no construtor.

##### Returns

`number`

## Methods

### getAxis()

> **getAxis**(`gamepadIndex`, `axis`): `number`

Defined in: [src/core/GamepadManager.ts:202](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GamepadManager.ts#L202)

Retorna o valor do eixo `axis` do gamepad `gamepadIndex` com deadzone
aplicada (valores no intervalo (-deadzone, +deadzone) viram 0).
Retorna 0 se o gamepad não estiver conectado ou o eixo não existir.

#### Parameters

##### gamepadIndex

`number`

##### axis

`number`

#### Returns

`number`

***

### getGamepad()

> **getGamepad**(`index`): [`GamepadState`](../interfaces/GamepadState.md) \| `null`

Defined in: [src/core/GamepadManager.ts:175](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GamepadManager.ts#L175)

Retorna uma cópia do estado do gamepad no slot `index`, ou `null` se
nenhum gamepad estiver conectado nesse slot.

#### Parameters

##### index

`number`

Slot do gamepad (0..3).

#### Returns

[`GamepadState`](../interfaces/GamepadState.md) \| `null`

***

### isButtonDown()

> **isButtonDown**(`gamepadIndex`, `button`): `boolean`

Defined in: [src/core/GamepadManager.ts:191](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GamepadManager.ts#L191)

Retorna `true` se o botão `button` do gamepad `gamepadIndex` estiver
pressionado. Retorna `false` se o gamepad não estiver conectado.

#### Parameters

##### gamepadIndex

`number`

##### button

`number`

#### Returns

`boolean`

***

### poll()

> **poll**(): `void`

Defined in: [src/core/GamepadManager.ts:85](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GamepadManager.ts#L85)

Lê o estado atual de todos os gamepads do `navigator`, atualiza o
estado interno e emite eventos de transição.

Deve ser chamado uma vez por frame. No-op em ambientes sem
`navigator.getGamepads` (Node.js).

#### Returns

`void`
