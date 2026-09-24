[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / PerfTrace

# Class: PerfTrace

Defined in: [src/core/PerfTrace.ts:353](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L353)

Amostrador do trace. O [Game](Game.md) chama [tick](#tick) a cada frame; ele só
faz trabalho quando (a) o host registrou a ponte e (b) passou o intervalo.

## Constructors

### Constructor

> **new PerfTrace**(): `PerfTrace`

#### Returns

`PerfTrace`

## Accessors

### enabled

#### Get Signature

> **get** **enabled**(): `boolean`

Defined in: [src/core/PerfTrace.ts:366](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L366)

`true` quando o host aceita trace (métricas ativas no export nativo).

##### Returns

`boolean`

## Methods

### pipelineCounters()

> **pipelineCounters**(): \{ `born`: `number`; `lookups`: `number`; \} \| `null`

Defined in: [src/core/PerfTrace.ts:383](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L383)

Consultas e nascimentos acumulados, ou `null` se a lista não está ligada.

#### Returns

\{ `born`: `number`; `lookups`: `number`; \} \| `null`

***

### recordEvent()

> **recordEvent**(`name`, `data`): `void`

Defined in: [src/core/PerfTrace.ts:391](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L391)

Grava um evento avulso no trace, fora do ritmo das amostras — para o que
acontece uma vez, como o aquecimento (SPEC-0261). No-op sem a ponte.

#### Parameters

##### name

`string`

##### data

`Record`\<`string`, `number`\>

#### Returns

`void`

***

### tick()

> **tick**(`deltaMs`, `scene`, `camera`, `profiler`, `info`, `phases?`, `systemProfile?`): `void`

Defined in: [src/core/PerfTrace.ts:406](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L406)

Avança o relógio e, no intervalo, grava uma amostra.

#### Parameters

##### deltaMs

`number`

Duração do frame.

##### scene

`Object3D`

Raiz da cena ativa.

##### camera

`Camera`

Câmera que renderizou o frame.

##### profiler

`FrameProfiler`

Fonte do tempo de CPU por seção.

##### info

\{ `drawCalls?`: `number`; `triangles?`: `number`; \} \| `null`

`renderer.info.render` (draws/triângulos do frame).

##### phases?

`RenderPhaseProbe` \| `null`

Sonda de fases do render (SPEC-0227); inerte se desligada.

##### systemProfile?

`Map`\<`string`, `number`\> \| `null`

#### Returns

`void`

***

### watchPipelines()

> **watchPipelines**(`backend`, `mainCamera`): `void`

Defined in: [src/core/PerfTrace.ts:377](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L377)

Passa a registrar QUAIS pipelines nascem (SPEC-0261). No-op sem a ponte do
host, e idempotente — pode ser chamado todo frame.

#### Parameters

##### backend

`unknown`

`renderer.threeRenderer.backend`.

##### mainCamera

() => `Camera` \| `null`

câmera do jogo, para separar a passada principal das outras.

#### Returns

`void`
