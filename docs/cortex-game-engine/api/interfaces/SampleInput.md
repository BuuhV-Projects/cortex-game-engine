[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / SampleInput

# Interface: SampleInput

Defined in: [src/core/PerfTrace.ts:311](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L311)

Dados do frame que a amostra precisa, já lidos pelo chamador.

## Properties

### born?

> `optional` **born?**: `object`

Defined in: [src/core/PerfTrace.ts:319](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L319)

#### buffers

> **buffers**: `number`

#### pipelines

> **pipelines**: `number`

#### textures

> **textures**: `number`

***

### camera

> **camera**: `Camera`

Defined in: [src/core/PerfTrace.ts:325](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L325)

***

### cpu

> **cpu**: `Record`\<`string`, `number`\>

Defined in: [src/core/PerfTrace.ts:314](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L314)

***

### cpuAvg?

> `optional` **cpuAvg?**: `Record`\<`string`, `number`\>

Defined in: [src/core/PerfTrace.ts:317](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L317)

Opcionais porque `buildSample` é pública e já tinha chamadores; ausentes
viram `{}`, que é o que um trace sem a janela do profiler tem a dizer.

***

### cpuP99?

> `optional` **cpuP99?**: `Record`\<`string`, `number`\>

Defined in: [src/core/PerfTrace.ts:318](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L318)

***

### draws

> **draws**: `number`

Defined in: [src/core/PerfTrace.ts:323](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L323)

***

### frameMs

> **frameMs**: `number`

Defined in: [src/core/PerfTrace.ts:313](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L313)

***

### gc?

> `optional` **gc?**: [`GcTotals`](GcTotals.md)

Defined in: [src/core/PerfTrace.ts:322](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L322)

***

### pipelineLookups?

> `optional` **pipelineLookups?**: `number`

Defined in: [src/core/PerfTrace.ts:321](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L321)

***

### pipelinesBorn?

> `optional` **pipelinesBorn?**: [`PipelineBirth`](PipelineBirth.md)[]

Defined in: [src/core/PerfTrace.ts:320](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L320)

***

### timeMs

> **timeMs**: `number`

Defined in: [src/core/PerfTrace.ts:312](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L312)

***

### tris

> **tris**: `number`

Defined in: [src/core/PerfTrace.ts:324](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L324)

***

### visible

> **visible**: [`VisibleNode`](VisibleNode.md)[]

Defined in: [src/core/PerfTrace.ts:326](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L326)
