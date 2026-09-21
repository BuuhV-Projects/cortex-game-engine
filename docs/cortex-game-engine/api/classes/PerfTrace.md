[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / PerfTrace

# Class: PerfTrace

Defined in: [src/core/PerfTrace.ts:301](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L301)

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

Defined in: [src/core/PerfTrace.ts:312](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L312)

`true` quando o host aceita trace (métricas ativas no export nativo).

##### Returns

`boolean`

## Methods

### tick()

> **tick**(`deltaMs`, `scene`, `camera`, `profiler`, `info`, `phases?`): `void`

Defined in: [src/core/PerfTrace.ts:326](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L326)

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

#### Returns

`void`
