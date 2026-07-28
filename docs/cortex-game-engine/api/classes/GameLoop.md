[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / GameLoop

# Class: GameLoop

Defined in: [src/core/GameLoop.ts:43](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L43)

## Constructors

### Constructor

> **new GameLoop**(`options`): `GameLoop`

Defined in: [src/core/GameLoop.ts:59](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L59)

#### Parameters

##### options

[`GameLoopOptions`](../interfaces/GameLoopOptions.md)

#### Returns

`GameLoop`

## Accessors

### isPaused

#### Get Signature

> **get** **isPaused**(): `boolean`

Defined in: [src/core/GameLoop.ts:117](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L117)

Indica se o loop está pausado.

##### Returns

`boolean`

***

### isRunning

#### Get Signature

> **get** **isRunning**(): `boolean`

Defined in: [src/core/GameLoop.ts:112](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L112)

Indica se o loop está ativo (inclui estado pausado).

##### Returns

`boolean`

## Methods

### pause()

> **pause**(): `void`

Defined in: [src/core/GameLoop.ts:92](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L92)

Pausa o loop sem resetar o estado. Use `resume()` para continuar.
Sem efeito se não estiver rodando ou já estiver pausado.

#### Returns

`void`

***

### resume()

> **resume**(): `void`

Defined in: [src/core/GameLoop.ts:103](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L103)

Retoma o loop após `pause()`. Reinicializa `lastTime` para evitar um
spike de deltaTime acumulado durante a pausa.
Sem efeito se não estiver rodando ou não estiver pausado.

#### Returns

`void`

***

### start()

> **start**(): `void`

Defined in: [src/core/GameLoop.ts:70](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L70)

Inicia o loop. Sem efeito se já estiver rodando.

#### Returns

`void`

***

### stop()

> **stop**(): `void`

Defined in: [src/core/GameLoop.ts:82](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L82)

Para o loop completamente e reseta o estado interno.

#### Returns

`void`
