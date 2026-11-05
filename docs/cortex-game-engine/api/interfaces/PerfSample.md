[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / PerfSample

# Interface: PerfSample

Defined in: [src/core/PerfTrace.ts:65](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L65)

Uma amostra do trace, como vai serializada em JSONL.

## Properties

### alloc?

> `optional` **alloc?**: [`AllocSample`](AllocSample.md)

Defined in: [src/core/PerfTrace.ts:121](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L121)

KB alocados pelo Hermes na janela e por sistema do ECS (SPEC-0688).

***

### born?

> `optional` **born?**: `object`

Defined in: [src/core/PerfTrace.ts:87](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L87)

Recursos de GPU CRIADOS desde o boot (SPEC-0252) — acumulados. A diferença entre duas amostras diz quantos
nasceram no intervalo: um frame que engasga sem draws altos e sem seção cara estava criando alguma coisa.
`pipelines` é o mais decisivo: `cpu.napiPipe` conta quantas vezes um pipeline é LIGADO, este conta quantos
NASCEM — e só isso denuncia compilação dentro do frame.

#### buffers

> **buffers**: `number`

#### pipelines

> **pipelines**: `number`

#### textures

> **textures**: `number`

***

### cam

> **cam**: `object`

Defined in: [src/core/PerfTrace.ts:109](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L109)

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

Defined in: [src/core/PerfTrace.ts:73](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L73)

ms de CPU por seção do FrameProfiler (`{ render: 28.1, … }`).

***

### cpuAvg

> **cpuAvg**: `Record`\<`string`, `number`\>

Defined in: [src/core/PerfTrace.ts:75](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L75)

Custo TÍPICO por seção — a média da janela de 240 frames do FrameProfiler, não o frame de [cpu](#cpu).

***

### cpuP99

> **cpuP99**: `Record`\<`string`, `number`\>

Defined in: [src/core/PerfTrace.ts:80](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L80)

PIOR CASO por seção (p99 da mesma janela). A distância até [cpuAvg](#cpuavg) é a variância da seção, que é o que
o jogador sente como oscilação — `cpu` sozinho não responde isso (SPEC-0250).

***

### draws

> **draws**: `number`

Defined in: [src/core/PerfTrace.ts:106](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L106)

***

### fps

> **fps**: `number`

Defined in: [src/core/PerfTrace.ts:70](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L70)

***

### frameMs

> **frameMs**: `number`

Defined in: [src/core/PerfTrace.ts:71](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L71)

***

### game?

> `optional` **game?**: `Record`\<`string`, `number`\>

Defined in: [src/core/PerfTrace.ts:113](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L113)

Medidores do jogo ([setPerfTraceGauge](../functions/setPerfTraceGauge.md), SPEC-0595): ausente sem nenhum registrado.

***

### gc?

> `optional` **gc?**: [`GcTotals`](GcTotals.md)

Defined in: [src/core/PerfTrace.ts:105](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L105)

Coletor de lixo do Hermes desde o boot (SPEC-0264) — acumulado; compare
amostras. `oldWallMs` é parede: uma coleta velha concorrente que atravesse
vários quadros aparece inteira. Ausente fora do host.

***

### heap?

> `optional` **heap?**: [`HeapStats`](HeapStats.md)

Defined in: [src/core/PerfTrace.ts:69](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L69)

Heap do Hermes (SPEC-0664); ausente fora do host nativo.

***

### nativePipelinesBorn?

> `optional` **nativePipelinesBorn?**: [`PipelineBirth`](PipelineBirth.md)[]

Defined in: [src/core/PerfTrace.ts:94](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L94)

Pipelines born in the engine's own renderer since the previous sample (SPEC-0585).

***

### pipelineLookups?

> `optional` **pipelineLookups?**: `number`

Defined in: [src/core/PerfTrace.ts:99](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L99)

Consultas ao cache de pipeline desde a instalação — acumulado, ACERTOS
incluídos (SPEC-0261). Consulta sem nascimento = pipeline reaproveitado.

***

### pipelinesBorn?

> `optional` **pipelinesBorn?**: [`PipelineBirth`](PipelineBirth.md)[]

Defined in: [src/core/PerfTrace.ts:92](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L92)

QUAIS pipelines nasceram desde a amostra anterior (SPEC-0261): objeto,
material, passada e custo. Ausente quando nada nasceu.

***

### renderServer?

> `optional` **renderServer?**: [`RenderServerSample`](RenderServerSample.md)

Defined in: [src/core/PerfTrace.ts:117](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L117)

Δ do `RenderServer.stats` na janela e recusas do NativeRenderer (SPEC-0688).

***

### sunShadow?

> `optional` **sunShadow?**: [`SunShadowSample`](SunShadowSample.md)

Defined in: [src/core/PerfTrace.ts:115](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L115)

Sombra do sol nativa na janela (SPEC-0688): ausente se o passe não rodou.

***

### t

> **t**: `number`

Defined in: [src/core/PerfTrace.ts:67](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L67)

ms desde o boot.

***

### tris

> **tris**: `number`

Defined in: [src/core/PerfTrace.ts:107](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L107)

***

### uiUploads?

> `optional` **uiUploads?**: [`UiUploadsSample`](UiUploadsSample.md)

Defined in: [src/core/PerfTrace.ts:119](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L119)

Reenvios de pixels da UI à GPU por widget (SPEC-0688): ausente sem upload.

***

### visible

> **visible**: [`VisibleNode`](VisibleNode.md)[]

Defined in: [src/core/PerfTrace.ts:111](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L111)

Nós de cena dentro do frustum, do mais caro (em triângulos) pro menos.
