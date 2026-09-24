[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / PipelineBirthLog

# Class: PipelineBirthLog

Defined in: src/core/PipelineBirthLog.ts:61

Registro dos nascimentos, drenado a cada amostra do trace.

## Example

```ts
const log = new PipelineBirthLog();
log.install(renderer.threeRenderer.backend, () => game.camera);
// ... a cada amostra:
const born = log.drain();
```

## Constructors

### Constructor

> **new PipelineBirthLog**(): `PipelineBirthLog`

#### Returns

`PipelineBirthLog`

## Methods

### drain()

> **drain**(): [`PipelineBirth`](../interfaces/PipelineBirth.md)[]

Defined in: src/core/PipelineBirthLog.ts:99

Os nascimentos desde a última chamada.

#### Returns

[`PipelineBirth`](../interfaces/PipelineBirth.md)[]

***

### install()

> **install**(`backend`, `mainCamera`, `now?`): `boolean`

Defined in: src/core/PipelineBirthLog.ts:70

Envolve `backend.createRenderPipeline`. Idempotente. Devolve `false` (e
avisa por `debug('perf')`) se o backend não tiver o método — uma versão do
three que o renomeou não pode quebrar o jogo por causa de um instrumento.

#### Parameters

##### backend

`unknown`

##### mainCamera

() => `Camera` \| `null`

##### now?

() => `number`

#### Returns

`boolean`
