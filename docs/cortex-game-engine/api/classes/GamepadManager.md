[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / GamepadManager

# Class: GamepadManager

Defined in: [.claude/worktrees/feat-input-rebind/src/core/GamepadManager.ts:69](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GamepadManager.ts#L69)

## Extends

- `EventTarget`

## Constructors

### Constructor

> **new GamepadManager**(`options?`): `GamepadManager`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/GamepadManager.ts:80](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GamepadManager.ts#L80)

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

Defined in: [.claude/worktrees/feat-input-rebind/src/core/GamepadManager.ts:288](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GamepadManager.ts#L288)

Limiar de deadzone configurado no construtor.

##### Returns

`number`

## Methods

### dispose()

> **dispose**(): `void`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/GamepadManager.ts:103](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GamepadManager.ts#L103)

Remove os listeners de (re)conexão registrados no `window`. Chame ao descartar
o manager (hot-reload/teardown) pra não vazar listeners. No-op fora do browser.

#### Returns

`void`

***

### firstConnectedIndex()

> **firstConnectedIndex**(): `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/GamepadManager.ts:278](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GamepadManager.ts#L278)

Índice do **primeiro slot com gamepad conectado**, ou `-1` se nenhum. No
Windows é comum o controle real cair no slot 1+ (dispositivo fantasma ocupa
o 0) — sistemas single-player devem ler este slot em vez de fixar o 0.

#### Returns

`number`

***

### getAxis()

> **getAxis**(`gamepadIndex`, `axis`): `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/GamepadManager.ts:258](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GamepadManager.ts#L258)

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

Defined in: [.claude/worktrees/feat-input-rebind/src/core/GamepadManager.ts:247](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GamepadManager.ts#L247)

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

Defined in: [.claude/worktrees/feat-input-rebind/src/core/GamepadManager.ts:219](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GamepadManager.ts#L219)

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

Defined in: [.claude/worktrees/feat-input-rebind/src/core/GamepadManager.ts:236](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GamepadManager.ts#L236)

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

### isConnected()

> **isConnected**(`index?`): `boolean`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/GamepadManager.ts:269](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GamepadManager.ts#L269)

`true` se há um gamepad conectado no slot `index` (default 0), sem alocar.
Útil pra fazer **fallback teclado/mouse** quando não há controle: leia o gamepad
se `isConnected()`, senão leia o teclado.

#### Parameters

##### index?

`number` = `0`

#### Returns

`boolean`

***

### poll()

> **poll**(): `void`

Defined in: [.claude/worktrees/feat-input-rebind/src/core/GamepadManager.ts:117](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GamepadManager.ts#L117)

Lê o estado atual de todos os gamepads do `navigator`, atualiza o
estado interno e emite eventos de transição.

Deve ser chamado uma vez por frame. No-op em ambientes sem
`navigator.getGamepads` (Node.js).

#### Returns

`void`
