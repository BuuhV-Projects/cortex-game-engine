[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / PerfSample

# Interface: PerfSample

Defined in: src/core/PerfTrace.ts:40

Uma amostra do trace, como vai serializada em JSONL.

## Properties

### cam

> **cam**: `object`

Defined in: src/core/PerfTrace.ts:50

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

Defined in: src/core/PerfTrace.ts:46

ms de CPU por seção do FrameProfiler (`{ render: 28.1, … }`).

***

### draws

> **draws**: `number`

Defined in: src/core/PerfTrace.ts:47

***

### fps

> **fps**: `number`

Defined in: src/core/PerfTrace.ts:43

***

### frameMs

> **frameMs**: `number`

Defined in: src/core/PerfTrace.ts:44

***

### t

> **t**: `number`

Defined in: src/core/PerfTrace.ts:42

ms desde o boot.

***

### tris

> **tris**: `number`

Defined in: src/core/PerfTrace.ts:48

***

### visible

> **visible**: [`VisibleNode`](VisibleNode.md)[]

Defined in: src/core/PerfTrace.ts:52

Nós de cena dentro do frustum, do mais caro (em triângulos) pro menos.
