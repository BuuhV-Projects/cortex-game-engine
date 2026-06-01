[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / GameLoop

# Class: GameLoop

Defined in: [src/core/GameLoop.ts:27](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L27)

## Constructors

### Constructor

> **new GameLoop**(`options`): `GameLoop`

Defined in: [src/core/GameLoop.ts:43](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L43)

#### Parameters

##### options

[`GameLoopOptions`](../interfaces/GameLoopOptions.md)

#### Returns

`GameLoop`

## Accessors

### isPaused

#### Get Signature

> **get** **isPaused**(): `boolean`

Defined in: [src/core/GameLoop.ts:101](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L101)

Indica se o loop está pausado.

##### Returns

`boolean`

***

### isRunning

#### Get Signature

> **get** **isRunning**(): `boolean`

Defined in: [src/core/GameLoop.ts:96](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L96)

Indica se o loop está ativo (inclui estado pausado).

##### Returns

`boolean`

## Methods

### pause()

> **pause**(): `void`

Defined in: [src/core/GameLoop.ts:76](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L76)

Pausa o loop sem resetar o estado. Use `resume()` para continuar.
Sem efeito se não estiver rodando ou já estiver pausado.

#### Returns

`void`

***

### resume()

> **resume**(): `void`

Defined in: [src/core/GameLoop.ts:87](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L87)

Retoma o loop após `pause()`. Reinicializa `lastTime` para evitar um
spike de deltaTime acumulado durante a pausa.
Sem efeito se não estiver rodando ou não estiver pausado.

#### Returns

`void`

***

### start()

> **start**(): `void`

Defined in: [src/core/GameLoop.ts:54](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L54)

Inicia o loop. Sem efeito se já estiver rodando.

#### Returns

`void`

***

### stop()

> **stop**(): `void`

Defined in: [src/core/GameLoop.ts:66](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L66)

Para o loop completamente e reseta o estado interno.

#### Returns

`void`
