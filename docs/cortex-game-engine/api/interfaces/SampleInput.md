[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / SampleInput

# Interface: SampleInput

Defined in: [src/core/PerfTrace.ts:282](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L282)

Dados do frame que a amostra precisa, já lidos pelo chamador.

## Properties

### born?

> `optional` **born?**: `object`

Defined in: [src/core/PerfTrace.ts:290](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L290)

#### buffers

> **buffers**: `number`

#### pipelines

> **pipelines**: `number`

#### textures

> **textures**: `number`

***

### camera

> **camera**: `Camera`

Defined in: [src/core/PerfTrace.ts:297](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L297)

***

### cpu

> **cpu**: `Record`\<`string`, `number`\>

Defined in: [src/core/PerfTrace.ts:285](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L285)

***

### cpuAvg?

> `optional` **cpuAvg?**: `Record`\<`string`, `number`\>

Defined in: [src/core/PerfTrace.ts:288](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L288)

Opcionais porque `buildSample` é pública e já tinha chamadores; ausentes
viram `{}`, que é o que um trace sem a janela do profiler tem a dizer.

***

### cpuP99?

> `optional` **cpuP99?**: `Record`\<`string`, `number`\>

Defined in: [src/core/PerfTrace.ts:289](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L289)

***

### draws

> **draws**: `number`

Defined in: [src/core/PerfTrace.ts:295](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L295)

***

### frameMs

> **frameMs**: `number`

Defined in: [src/core/PerfTrace.ts:284](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L284)

***

### game?

> `optional` **game?**: `Record`\<`string`, `number`\>

Defined in: [src/core/PerfTrace.ts:299](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L299)

***

### gc?

> `optional` **gc?**: [`GcTotals`](GcTotals.md)

Defined in: [src/core/PerfTrace.ts:294](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L294)

***

### nativePipelinesBorn?

> `optional` **nativePipelinesBorn?**: [`PipelineBirth`](PipelineBirth.md)[]

Defined in: [src/core/PerfTrace.ts:292](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L292)

***

### pipelineLookups?

> `optional` **pipelineLookups?**: `number`

Defined in: [src/core/PerfTrace.ts:293](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L293)

***

### pipelinesBorn?

> `optional` **pipelinesBorn?**: [`PipelineBirth`](PipelineBirth.md)[]

Defined in: [src/core/PerfTrace.ts:291](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L291)

***

### timeMs

> **timeMs**: `number`

Defined in: [src/core/PerfTrace.ts:283](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L283)

***

### tris

> **tris**: `number`

Defined in: [src/core/PerfTrace.ts:296](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L296)

***

### visible

> **visible**: [`VisibleNode`](VisibleNode.md)[]

Defined in: [src/core/PerfTrace.ts:298](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L298)
