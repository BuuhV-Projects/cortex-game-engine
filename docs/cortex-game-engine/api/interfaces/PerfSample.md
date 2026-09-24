[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / PerfSample

# Interface: PerfSample

Defined in: [src/core/PerfTrace.ts:73](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L73)

Uma amostra do trace, como vai serializada em JSONL.

## Properties

### born?

> `optional` **born?**: `object`

Defined in: [src/core/PerfTrace.ts:102](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L102)

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

Defined in: [src/core/PerfTrace.ts:111](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L111)

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

Defined in: [src/core/PerfTrace.ts:79](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L79)

ms de CPU por seção do FrameProfiler (`{ render: 28.1, … }`).

***

### cpuAvg

> **cpuAvg**: `Record`\<`string`, `number`\>

Defined in: [src/core/PerfTrace.ts:84](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L84)

Custo TÍPICO por seção — a média da janela de 240 frames do
FrameProfiler, não o frame sorteado que vai em [cpu](#cpu).

***

### cpuP99

> **cpuP99**: `Record`\<`string`, `number`\>

Defined in: [src/core/PerfTrace.ts:90](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L90)

PIOR CASO por seção (p99 da mesma janela). A distância até [cpuAvg](#cpuavg)
é a variância da seção, que é o que o jogador sente como oscilação —
`cpu` sozinho não responde isso (SPEC-0250).

***

### draws

> **draws**: `number`

Defined in: [src/core/PerfTrace.ts:108](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L108)

***

### fps

> **fps**: `number`

Defined in: [src/core/PerfTrace.ts:76](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L76)

***

### frameMs

> **frameMs**: `number`

Defined in: [src/core/PerfTrace.ts:77](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L77)

***

### pipelinesBorn?

> `optional` **pipelinesBorn?**: [`PipelineBirth`](PipelineBirth.md)[]

Defined in: [src/core/PerfTrace.ts:107](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L107)

QUAIS pipelines nasceram desde a amostra anterior (SPEC-0261): objeto,
material, passada e custo. Ausente quando nada nasceu.

***

### t

> **t**: `number`

Defined in: [src/core/PerfTrace.ts:75](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L75)

ms desde o boot.

***

### tris

> **tris**: `number`

Defined in: [src/core/PerfTrace.ts:109](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L109)

***

### visible

> **visible**: [`VisibleNode`](VisibleNode.md)[]

Defined in: [src/core/PerfTrace.ts:113](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L113)

Nós de cena dentro do frustum, do mais caro (em triângulos) pro menos.
