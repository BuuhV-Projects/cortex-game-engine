[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / SampleInput

# Interface: SampleInput

Defined in: [src/core/PerfTrace.ts:291](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L291)

Dados do frame que a amostra precisa, já lidos pelo chamador.

## Properties

### born?

> `optional` **born?**: `object`

Defined in: [src/core/PerfTrace.ts:299](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L299)

#### buffers

> **buffers**: `number`

#### pipelines

> **pipelines**: `number`

#### textures

> **textures**: `number`

***

### camera

> **camera**: `Camera`

Defined in: [src/core/PerfTrace.ts:303](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L303)

***

### cpu

> **cpu**: `Record`\<`string`, `number`\>

Defined in: [src/core/PerfTrace.ts:294](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L294)

***

### cpuAvg?

> `optional` **cpuAvg?**: `Record`\<`string`, `number`\>

Defined in: [src/core/PerfTrace.ts:297](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L297)

Opcionais porque `buildSample` é pública e já tinha chamadores; ausentes
viram `{}`, que é o que um trace sem a janela do profiler tem a dizer.

***

### cpuP99?

> `optional` **cpuP99?**: `Record`\<`string`, `number`\>

Defined in: [src/core/PerfTrace.ts:298](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L298)

***

### draws

> **draws**: `number`

Defined in: [src/core/PerfTrace.ts:301](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L301)

***

### frameMs

> **frameMs**: `number`

Defined in: [src/core/PerfTrace.ts:293](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L293)

***

### pipelinesBorn?

> `optional` **pipelinesBorn?**: [`PipelineBirth`](PipelineBirth.md)[]

Defined in: [src/core/PerfTrace.ts:300](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L300)

***

### timeMs

> **timeMs**: `number`

Defined in: [src/core/PerfTrace.ts:292](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L292)

***

### tris

> **tris**: `number`

Defined in: [src/core/PerfTrace.ts:302](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L302)

***

### visible

> **visible**: [`VisibleNode`](VisibleNode.md)[]

Defined in: [src/core/PerfTrace.ts:304](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L304)
