[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / SampleInput

# Interface: SampleInput

Defined in: [src/core/PerfTrace.ts:285](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L285)

Dados do frame que a amostra precisa, já lidos pelo chamador.

## Properties

### born?

> `optional` **born?**: `object`

Defined in: [src/core/PerfTrace.ts:293](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L293)

#### buffers

> **buffers**: `number`

#### pipelines

> **pipelines**: `number`

#### textures

> **textures**: `number`

***

### camera

> **camera**: `Camera`

Defined in: [src/core/PerfTrace.ts:296](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L296)

***

### cpu

> **cpu**: `Record`\<`string`, `number`\>

Defined in: [src/core/PerfTrace.ts:288](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L288)

***

### cpuAvg?

> `optional` **cpuAvg?**: `Record`\<`string`, `number`\>

Defined in: [src/core/PerfTrace.ts:291](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L291)

Opcionais porque `buildSample` é pública e já tinha chamadores; ausentes
viram `{}`, que é o que um trace sem a janela do profiler tem a dizer.

***

### cpuP99?

> `optional` **cpuP99?**: `Record`\<`string`, `number`\>

Defined in: [src/core/PerfTrace.ts:292](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L292)

***

### draws

> **draws**: `number`

Defined in: [src/core/PerfTrace.ts:294](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L294)

***

### frameMs

> **frameMs**: `number`

Defined in: [src/core/PerfTrace.ts:287](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L287)

***

### timeMs

> **timeMs**: `number`

Defined in: [src/core/PerfTrace.ts:286](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L286)

***

### tris

> **tris**: `number`

Defined in: [src/core/PerfTrace.ts:295](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L295)

***

### visible

> **visible**: [`VisibleNode`](VisibleNode.md)[]

Defined in: [src/core/PerfTrace.ts:297](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L297)
