[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / PerfSample

# Interface: PerfSample

Defined in: [src/core/PerfTrace.ts:85](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L85)

Uma amostra do trace, como vai serializada em JSONL.

## Properties

### born?

> `optional` **born?**: `object`

Defined in: [src/core/PerfTrace.ts:116](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L116)

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

Defined in: [src/core/PerfTrace.ts:138](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L138)

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

Defined in: [src/core/PerfTrace.ts:93](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L93)

ms de CPU por seção do FrameProfiler (`{ render: 28.1, … }`).

***

### cpuAvg

> **cpuAvg**: `Record`\<`string`, `number`\>

Defined in: [src/core/PerfTrace.ts:98](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L98)

Custo TÍPICO por seção — a média da janela de 240 frames do
FrameProfiler, não o frame sorteado que vai em [cpu](#cpu).

***

### cpuP99

> **cpuP99**: `Record`\<`string`, `number`\>

Defined in: [src/core/PerfTrace.ts:104](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L104)

PIOR CASO por seção (p99 da mesma janela). A distância até [cpuAvg](#cpuavg)
é a variância da seção, que é o que o jogador sente como oscilação —
`cpu` sozinho não responde isso (SPEC-0250).

***

### draws

> **draws**: `number`

Defined in: [src/core/PerfTrace.ts:135](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L135)

***

### fps

> **fps**: `number`

Defined in: [src/core/PerfTrace.ts:90](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L90)

***

### frameMs

> **frameMs**: `number`

Defined in: [src/core/PerfTrace.ts:91](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L91)

***

### game?

> `optional` **game?**: `Record`\<`string`, `number`\>

Defined in: [src/core/PerfTrace.ts:142](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L142)

Medidores do jogo ([setPerfTraceGauge](../functions/setPerfTraceGauge.md), SPEC-0595): ausente sem nenhum registrado.

***

### gc?

> `optional` **gc?**: [`GcTotals`](GcTotals.md)

Defined in: [src/core/PerfTrace.ts:134](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L134)

Coletor de lixo do Hermes desde o boot (SPEC-0264) — acumulado; compare
amostras. `oldWallMs` é parede: uma coleta velha concorrente que atravesse
vários quadros aparece inteira. Ausente fora do host.

***

### heap?

> `optional` **heap?**: [`HeapStats`](HeapStats.md)

Defined in: [src/core/PerfTrace.ts:89](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L89)

Heap do Hermes (SPEC-0664); ausente fora do host nativo.

***

### nativePipelinesBorn?

> `optional` **nativePipelinesBorn?**: [`PipelineBirth`](PipelineBirth.md)[]

Defined in: [src/core/PerfTrace.ts:123](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L123)

Pipelines born in the engine's own renderer since the previous sample (SPEC-0585).

***

### pipelineLookups?

> `optional` **pipelineLookups?**: `number`

Defined in: [src/core/PerfTrace.ts:128](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L128)

Consultas ao cache de pipeline desde a instalação — acumulado, ACERTOS
incluídos (SPEC-0261). Consulta sem nascimento = pipeline reaproveitado.

***

### pipelinesBorn?

> `optional` **pipelinesBorn?**: [`PipelineBirth`](PipelineBirth.md)[]

Defined in: [src/core/PerfTrace.ts:121](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L121)

QUAIS pipelines nasceram desde a amostra anterior (SPEC-0261): objeto,
material, passada e custo. Ausente quando nada nasceu.

***

### t

> **t**: `number`

Defined in: [src/core/PerfTrace.ts:87](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L87)

ms desde o boot.

***

### tris

> **tris**: `number`

Defined in: [src/core/PerfTrace.ts:136](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L136)

***

### visible

> **visible**: [`VisibleNode`](VisibleNode.md)[]

Defined in: [src/core/PerfTrace.ts:140](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PerfTrace.ts#L140)

Nós de cena dentro do frustum, do mais caro (em triângulos) pro menos.
