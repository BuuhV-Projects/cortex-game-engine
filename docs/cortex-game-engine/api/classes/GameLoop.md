[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / GameLoop

# Class: GameLoop

Defined in: [.claude/worktrees/perf-boot-nativo/src/core/GameLoop.ts:44](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L44)

## Constructors

### Constructor

> **new GameLoop**(`options`): `GameLoop`

Defined in: [.claude/worktrees/perf-boot-nativo/src/core/GameLoop.ts:60](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L60)

#### Parameters

##### options

[`GameLoopOptions`](../interfaces/GameLoopOptions.md)

#### Returns

`GameLoop`

## Accessors

### isPaused

#### Get Signature

> **get** **isPaused**(): `boolean`

Defined in: [.claude/worktrees/perf-boot-nativo/src/core/GameLoop.ts:118](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L118)

Indica se o loop está pausado.

##### Returns

`boolean`

***

### isRunning

#### Get Signature

> **get** **isRunning**(): `boolean`

Defined in: [.claude/worktrees/perf-boot-nativo/src/core/GameLoop.ts:113](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L113)

Indica se o loop está ativo (inclui estado pausado).

##### Returns

`boolean`

## Methods

### pause()

> **pause**(): `void`

Defined in: [.claude/worktrees/perf-boot-nativo/src/core/GameLoop.ts:93](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L93)

Pausa o loop sem resetar o estado. Use `resume()` para continuar.
Sem efeito se não estiver rodando ou já estiver pausado.

#### Returns

`void`

***

### resume()

> **resume**(): `void`

Defined in: [.claude/worktrees/perf-boot-nativo/src/core/GameLoop.ts:104](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L104)

Retoma o loop após `pause()`. Reinicializa `lastTime` para evitar um
spike de deltaTime acumulado durante a pausa.
Sem efeito se não estiver rodando ou não estiver pausado.

#### Returns

`void`

***

### start()

> **start**(): `void`

Defined in: [.claude/worktrees/perf-boot-nativo/src/core/GameLoop.ts:71](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L71)

Inicia o loop. Sem efeito se já estiver rodando.

#### Returns

`void`

***

### stop()

> **stop**(): `void`

Defined in: [.claude/worktrees/perf-boot-nativo/src/core/GameLoop.ts:83](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/GameLoop.ts#L83)

Para o loop completamente e reseta o estado interno.

#### Returns

`void`
