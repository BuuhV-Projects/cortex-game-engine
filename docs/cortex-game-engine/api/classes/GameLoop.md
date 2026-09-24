[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / GameLoop

# Class: GameLoop

Defined in: [src/core/GameLoop.ts:155](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L155)

## Constructors

### Constructor

> **new GameLoop**(`options`): `GameLoop`

Defined in: [src/core/GameLoop.ts:173](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L173)

#### Parameters

##### options

[`GameLoopOptions`](../interfaces/GameLoopOptions.md)

#### Returns

`GameLoop`

## Accessors

### isPaused

#### Get Signature

> **get** **isPaused**(): `boolean`

Defined in: [src/core/GameLoop.ts:232](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L232)

Indica se o loop está pausado.

##### Returns

`boolean`

***

### isRunning

#### Get Signature

> **get** **isRunning**(): `boolean`

Defined in: [src/core/GameLoop.ts:227](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L227)

Indica se o loop está ativo (inclui estado pausado).

##### Returns

`boolean`

***

### maxFps

#### Get Signature

> **get** **maxFps**(): `number`

Defined in: [src/core/GameLoop.ts:243](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L243)

Teto de quadros por segundo escolhido pelo jogo (ADR-0257). `0` = sem teto.

Com vsync, só divisores do refresh dão frames de duração igual (num monitor
de 75 Hz: 75, 37,5, 25). Outro valor acerta a média mas alterna durações —
ainda melhor que oscilar sem padrão. Veja [refreshHz](#refreshhz).

##### Returns

`number`

#### Set Signature

> **set** **maxFps**(`fps`): `void`

Defined in: [src/core/GameLoop.ts:247](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L247)

##### Parameters

###### fps

`number`

##### Returns

`void`

***

### refreshHz

#### Get Signature

> **get** **refreshHz**(): `number` \| `null`

Defined in: [src/core/GameLoop.ts:252](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L252)

Refresh do monitor estimado nos primeiros frames (Hz), ou `null` até lá.

##### Returns

`number` \| `null`

## Methods

### pause()

> **pause**(): `void`

Defined in: [src/core/GameLoop.ts:207](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L207)

Pausa o loop sem resetar o estado. Use `resume()` para continuar.
Sem efeito se não estiver rodando ou já estiver pausado.

#### Returns

`void`

***

### resume()

> **resume**(): `void`

Defined in: [src/core/GameLoop.ts:218](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L218)

Retoma o loop após `pause()`. Reinicializa `lastTime` para evitar um
spike de deltaTime acumulado durante a pausa.
Sem efeito se não estiver rodando ou não estiver pausado.

#### Returns

`void`

***

### start()

> **start**(): `void`

Defined in: [src/core/GameLoop.ts:185](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L185)

Inicia o loop. Sem efeito se já estiver rodando.

#### Returns

`void`

***

### stop()

> **stop**(): `void`

Defined in: [src/core/GameLoop.ts:197](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L197)

Para o loop completamente e reseta o estado interno.

#### Returns

`void`
