[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / GamepadManager

# Class: GamepadManager

Defined in: [src/core/GamepadManager.ts:69](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GamepadManager.ts#L69)

## Extends

- `EventTarget`

## Constructors

### Constructor

> **new GamepadManager**(`options?`): `GamepadManager`

Defined in: [src/core/GamepadManager.ts:80](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GamepadManager.ts#L80)

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

Defined in: [src/core/GamepadManager.ts:257](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GamepadManager.ts#L257)

Limiar de deadzone configurado no construtor.

##### Returns

`number`

## Methods

### dispose()

> **dispose**(): `void`

Defined in: [src/core/GamepadManager.ts:103](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GamepadManager.ts#L103)

Remove os listeners de (re)conexão registrados no `window`. Chame ao descartar
o manager (hot-reload/teardown) pra não vazar listeners. No-op fora do browser.

#### Returns

`void`

***

### getAxis()

> **getAxis**(`gamepadIndex`, `axis`): `number`

Defined in: [src/core/GamepadManager.ts:248](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GamepadManager.ts#L248)

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

### getButtonValue()

> **getButtonValue**(`gamepadIndex`, `button`): `number`

Defined in: [src/core/GamepadManager.ts:237](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GamepadManager.ts#L237)

Retorna o valor **analógico** do botão `button` (0..1). Útil pros gatilhos
LT (6) / RT (7), que no Xbox são analógicos. Retorna 0 se desconectado ou
o botão não existir. (`isButtonDown` continua dando o booleano `pressed`.)

#### Parameters

##### gamepadIndex

`number`

##### button

`number`

#### Returns

`number`

***

### getGamepad()

> **getGamepad**(`index`): [`GamepadState`](../interfaces/GamepadState.md) \| `null`

Defined in: [src/core/GamepadManager.ts:209](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GamepadManager.ts#L209)

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

Defined in: [src/core/GamepadManager.ts:226](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GamepadManager.ts#L226)

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

Defined in: [src/core/GamepadManager.ts:117](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GamepadManager.ts#L117)

Lê o estado atual de todos os gamepads do `navigator`, atualiza o
estado interno e emite eventos de transição.

Deve ser chamado uma vez por frame. No-op em ambientes sem
`navigator.getGamepads` (Node.js).

#### Returns

`void`
