[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / PerfSample

# Interface: PerfSample

Defined in: [src/core/PerfTrace.ts:72](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L72)

Uma amostra do trace, como vai serializada em JSONL.

## Properties

### cam

> **cam**: `object`

Defined in: [src/core/PerfTrace.ts:82](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L82)

Posição da câmera (x, y, z) e direção para onde olha.

#### dx

> **dx**: `number`

#### dy

> **dy**: `number`

#### dz

> **dz**: `number`

#### x

> **x**: `number`

#### y

> **y**: `number`

#### z

> **z**: `number`

***

### cpu

> **cpu**: `Record`\<`string`, `number`\>

Defined in: [src/core/PerfTrace.ts:78](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L78)

ms de CPU por seção do FrameProfiler (`{ render: 28.1, … }`).

***

### draws

> **draws**: `number`

Defined in: [src/core/PerfTrace.ts:79](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L79)

***

### fps

> **fps**: `number`

Defined in: [src/core/PerfTrace.ts:75](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L75)

***

### frameMs

> **frameMs**: `number`

Defined in: [src/core/PerfTrace.ts:76](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L76)

***

### t

> **t**: `number`

Defined in: [src/core/PerfTrace.ts:74](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L74)

ms desde o boot.

***

### tris

> **tris**: `number`

Defined in: [src/core/PerfTrace.ts:80](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L80)

***

### visible

> **visible**: [`VisibleNode`](VisibleNode.md)[]

Defined in: [src/core/PerfTrace.ts:84](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L84)

Nós de cena dentro do frustum, do mais caro (em triângulos) pro menos.
