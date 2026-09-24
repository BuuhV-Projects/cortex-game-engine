[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / PipelineBirth

# Interface: PipelineBirth

Defined in: src/core/PipelineBirthLog.ts:17

Um pipeline criado, com o que é preciso para aquecê-lo no carregamento.

## Properties

### camera

> **camera**: `string`

Defined in: src/core/PipelineBirthLog.ts:25

`main` para a câmera do jogo; senão o `type` da câmera (sombra usa a da luz).

***

### material

> **material**: `string`

Defined in: src/core/PipelineBirthLog.ts:21

Nome do material, ou o `type`.

***

### ms

> **ms**: `number`

Defined in: src/core/PipelineBirthLog.ts:27

Duração da criação (ms), com a compilação síncrona do host.

***

### object

> **object**: `string`

Defined in: src/core/PipelineBirthLog.ts:19

Nome do objeto, ou do ancestral nomeado mais próximo, ou o `type`.

***

### transparent

> **transparent**: `boolean`

Defined in: src/core/PipelineBirthLog.ts:23

Variante translúcida — nasce quando um material muda de opaco para translúcido.
