[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / SampleInput

# Interface: SampleInput

Defined in: [src/core/PerfTrace.ts:436](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L436)

Dados do frame que a amostra precisa, já lidos pelo chamador.

## Properties

### born?

> `optional` **born?**: `object`

Defined in: [src/core/PerfTrace.ts:444](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L444)

#### buffers

> **buffers**: `number`

#### pipelines

> **pipelines**: `number`

#### textures

> **textures**: `number`

***

### camera

> **camera**: `Camera`

Defined in: [src/core/PerfTrace.ts:450](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L450)

***

### cpu

> **cpu**: `Record`\<`string`, `number`\>

Defined in: [src/core/PerfTrace.ts:439](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L439)

***

### cpuAvg?

> `optional` **cpuAvg?**: `Record`\<`string`, `number`\>

Defined in: [src/core/PerfTrace.ts:442](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L442)

Opcionais porque `buildSample` é pública e já tinha chamadores; ausentes
viram `{}`, que é o que um trace sem a janela do profiler tem a dizer.

***

### cpuP99?

> `optional` **cpuP99?**: `Record`\<`string`, `number`\>

Defined in: [src/core/PerfTrace.ts:443](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L443)

***

### draws

> **draws**: `number`

Defined in: [src/core/PerfTrace.ts:448](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L448)

***

### frameMs

> **frameMs**: `number`

Defined in: [src/core/PerfTrace.ts:438](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L438)

***

### gc?

> `optional` **gc?**: [`GcTotals`](GcTotals.md)

Defined in: [src/core/PerfTrace.ts:447](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L447)

***

### pipelineLookups?

> `optional` **pipelineLookups?**: `number`

Defined in: [src/core/PerfTrace.ts:446](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L446)

***

### pipelinesBorn?

> `optional` **pipelinesBorn?**: [`PipelineBirth`](PipelineBirth.md)[]

Defined in: [src/core/PerfTrace.ts:445](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L445)

***

### timeMs

> **timeMs**: `number`

Defined in: [src/core/PerfTrace.ts:437](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L437)

***

### tris

> **tris**: `number`

Defined in: [src/core/PerfTrace.ts:449](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L449)

***

### visible

> **visible**: [`VisibleNode`](VisibleNode.md)[]

Defined in: [src/core/PerfTrace.ts:451](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L451)
