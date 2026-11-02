[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / SampleInput

# Interface: SampleInput

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/core/PerfTrace.ts:467](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L467)

Dados do frame que a amostra precisa, já lidos pelo chamador.

## Properties

### born?

> `optional` **born?**: `object`

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/core/PerfTrace.ts:475](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L475)

#### buffers

> **buffers**: `number`

#### pipelines

> **pipelines**: `number`

#### textures

> **textures**: `number`

***

### camera

> **camera**: `Camera`

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/core/PerfTrace.ts:482](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L482)

***

### cpu

> **cpu**: `Record`\<`string`, `number`\>

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/core/PerfTrace.ts:470](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L470)

***

### cpuAvg?

> `optional` **cpuAvg?**: `Record`\<`string`, `number`\>

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/core/PerfTrace.ts:473](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L473)

Opcionais porque `buildSample` é pública e já tinha chamadores; ausentes
viram `{}`, que é o que um trace sem a janela do profiler tem a dizer.

***

### cpuP99?

> `optional` **cpuP99?**: `Record`\<`string`, `number`\>

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/core/PerfTrace.ts:474](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L474)

***

### draws

> **draws**: `number`

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/core/PerfTrace.ts:480](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L480)

***

### frameMs

> **frameMs**: `number`

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/core/PerfTrace.ts:469](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L469)

***

### game?

> `optional` **game?**: `Record`\<`string`, `number`\>

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/core/PerfTrace.ts:484](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L484)

***

### gc?

> `optional` **gc?**: [`GcTotals`](GcTotals.md)

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/core/PerfTrace.ts:479](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L479)

***

### nativePipelinesBorn?

> `optional` **nativePipelinesBorn?**: [`PipelineBirth`](PipelineBirth.md)[]

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/core/PerfTrace.ts:477](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L477)

***

### pipelineLookups?

> `optional` **pipelineLookups?**: `number`

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/core/PerfTrace.ts:478](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L478)

***

### pipelinesBorn?

> `optional` **pipelinesBorn?**: [`PipelineBirth`](PipelineBirth.md)[]

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/core/PerfTrace.ts:476](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L476)

***

### timeMs

> **timeMs**: `number`

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/core/PerfTrace.ts:468](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L468)

***

### tris

> **tris**: `number`

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/core/PerfTrace.ts:481](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L481)

***

### visible

> **visible**: [`VisibleNode`](VisibleNode.md)[]

Defined in: [.claude/worktrees/gta3-transit-system-4d41b4/src/core/PerfTrace.ts:483](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L483)
