[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / PipelineBirthLog

# Class: PipelineBirthLog

Defined in: [src/core/PipelineBirthLog.ts:70](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PipelineBirthLog.ts#L70)

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

## Accessors

### births

#### Get Signature

> **get** **births**(): `number`

Defined in: [src/core/PipelineBirthLog.ts:86](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PipelineBirthLog.ts#L86)

Nascimentos desde a instalação (não é zerado pelo [PipelineBirthLog.drain](#drain)).

##### Returns

`number`

***

### lookups

#### Get Signature

> **get** **lookups**(): `number`

Defined in: [src/core/PipelineBirthLog.ts:81](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PipelineBirthLog.ts#L81)

Consultas ao cache de pipeline desde a instalação, ACERTOS incluídos. O
three chama `backend.getRenderCacheKey` uma vez por consulta que precisa de
pipeline — então consultas sem nascimento = pipeline reaproveitado.

##### Returns

`number`

## Methods

### drain()

> **drain**(): [`PipelineBirth`](../interfaces/PipelineBirth.md)[]

Defined in: [src/core/PipelineBirthLog.ts:134](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PipelineBirthLog.ts#L134)

Os nascimentos desde a última chamada.

#### Returns

[`PipelineBirth`](../interfaces/PipelineBirth.md)[]

***

### install()

> **install**(`backend`, `mainCamera`, `now?`): `boolean`

Defined in: [src/core/PipelineBirthLog.ts:95](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PipelineBirthLog.ts#L95)

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
