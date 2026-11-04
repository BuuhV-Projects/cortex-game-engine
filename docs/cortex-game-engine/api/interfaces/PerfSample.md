[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / PerfSample

# Interface: PerfSample

Defined in: [src/core/PerfTrace.ts:81](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L81)

Uma amostra do trace, como vai serializada em JSONL. Os campos de diagnóstico vêm de TraceCounterFields (SPEC-0688).

## Extends

- `TraceCounterFields`

## Properties

### alloc?

> `optional` **alloc?**: `AllocSample`

Defined in: [src/core/perfTrace/traceCounters.ts:108](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/perfTrace/traceCounters.ts#L108)

#### Inherited from

`TraceCounterFields.alloc`

***

### born?

> `optional` **born?**: `object`

Defined in: [src/core/PerfTrace.ts:112](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L112)

Recursos de GPU CRIADOS desde o boot (SPEC-0252) — acumulados.

A diferença entre duas amostras diz quantos nasceram no intervalo, que é a
pergunta que os contadores de custo não respondem: um frame que engasga
sem draws altos e sem seção cara estava criando alguma coisa.

`pipelines` é o mais decisivo: diferente de `cpu.napiPipe` (que conta
`setPipeline`, ou seja, quantas vezes um pipeline é LIGADO), este conta
quantos NASCEM — e só isso denuncia compilação dentro do frame.

#### buffers

> **buffers**: `number`

#### pipelines

> **pipelines**: `number`

#### textures

> **textures**: `number`

***

### cam

> **cam**: `object`

Defined in: [src/core/PerfTrace.ts:134](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L134)

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

Defined in: [src/core/PerfTrace.ts:89](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L89)

ms de CPU por seção do FrameProfiler (`{ render: 28.1, … }`).

***

### cpuAvg

> **cpuAvg**: `Record`\<`string`, `number`\>

Defined in: [src/core/PerfTrace.ts:94](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L94)

Custo TÍPICO por seção — a média da janela de 240 frames do
FrameProfiler, não o frame sorteado que vai em [cpu](#cpu).

***

### cpuP99

> **cpuP99**: `Record`\<`string`, `number`\>

Defined in: [src/core/PerfTrace.ts:100](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L100)

PIOR CASO por seção (p99 da mesma janela). A distância até [cpuAvg](#cpuavg)
é a variância da seção, que é o que o jogador sente como oscilação —
`cpu` sozinho não responde isso (SPEC-0250).

***

### draws

> **draws**: `number`

Defined in: [src/core/PerfTrace.ts:131](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L131)

***

### fps

> **fps**: `number`

Defined in: [src/core/PerfTrace.ts:86](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L86)

***

### frameMs

> **frameMs**: `number`

Defined in: [src/core/PerfTrace.ts:87](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L87)

***

### game?

> `optional` **game?**: `Record`\<`string`, `number`\>

Defined in: [src/core/PerfTrace.ts:138](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L138)

Medidores do jogo ([setPerfTraceGauge](../functions/setPerfTraceGauge.md), SPEC-0595): ausente sem nenhum registrado.

***

### gc?

> `optional` **gc?**: [`GcTotals`](GcTotals.md)

Defined in: [src/core/PerfTrace.ts:130](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L130)

Coletor de lixo do Hermes desde o boot (SPEC-0264) — acumulado; compare
amostras. `oldWallMs` é parede: uma coleta velha concorrente que atravesse
vários quadros aparece inteira. Ausente fora do host.

***

### heap?

> `optional` **heap?**: [`HeapStats`](HeapStats.md)

Defined in: [src/core/PerfTrace.ts:85](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L85)

Heap do Hermes (SPEC-0664); ausente fora do host nativo.

***

### nativePipelinesBorn?

> `optional` **nativePipelinesBorn?**: [`PipelineBirth`](PipelineBirth.md)[]

Defined in: [src/core/PerfTrace.ts:119](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L119)

Pipelines born in the engine's own renderer since the previous sample (SPEC-0585).

***

### pipelineLookups?

> `optional` **pipelineLookups?**: `number`

Defined in: [src/core/PerfTrace.ts:124](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L124)

Consultas ao cache de pipeline desde a instalação — acumulado, ACERTOS
incluídos (SPEC-0261). Consulta sem nascimento = pipeline reaproveitado.

***

### pipelinesBorn?

> `optional` **pipelinesBorn?**: [`PipelineBirth`](PipelineBirth.md)[]

Defined in: [src/core/PerfTrace.ts:117](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L117)

QUAIS pipelines nasceram desde a amostra anterior (SPEC-0261): objeto,
material, passada e custo. Ausente quando nada nasceu.

***

### renderServer?

> `optional` **renderServer?**: `RenderServerSample`

Defined in: [src/core/perfTrace/traceCounters.ts:106](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/perfTrace/traceCounters.ts#L106)

#### Inherited from

`TraceCounterFields.renderServer`

***

### sunShadow?

> `optional` **sunShadow?**: `SunShadowSample`

Defined in: [src/core/perfTrace/traceCounters.ts:105](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/perfTrace/traceCounters.ts#L105)

#### Inherited from

`TraceCounterFields.sunShadow`

***

### t

> **t**: `number`

Defined in: [src/core/PerfTrace.ts:83](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L83)

ms desde o boot.

***

### tris

> **tris**: `number`

Defined in: [src/core/PerfTrace.ts:132](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L132)

***

### uiUploads?

> `optional` **uiUploads?**: `UiUploadsSample`

Defined in: [src/core/perfTrace/traceCounters.ts:107](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/perfTrace/traceCounters.ts#L107)

#### Inherited from

`TraceCounterFields.uiUploads`

***

### visible

> **visible**: [`VisibleNode`](VisibleNode.md)[]

Defined in: [src/core/PerfTrace.ts:136](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L136)

Nós de cena dentro do frustum, do mais caro (em triângulos) pro menos.
