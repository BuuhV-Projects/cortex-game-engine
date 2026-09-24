[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / PipelineBirth

# Interface: PipelineBirth

Defined in: [src/core/PipelineBirthLog.ts:17](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PipelineBirthLog.ts#L17)

Um pipeline criado, com o que é preciso para aquecê-lo no carregamento.

## Properties

### camera

> **camera**: `string`

Defined in: [src/core/PipelineBirthLog.ts:25](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PipelineBirthLog.ts#L25)

`main` para a câmera do jogo; senão o `type` da câmera (sombra usa a da luz).

***

### key

> **key**: `string`

Defined in: [src/core/PipelineBirthLog.ts:33](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PipelineBirthLog.ts#L33)

Chave de cache do three: ids dos shaders de vértice e fragmento + estado
(blend, depth, face, formato/amostras do alvo, geometria). Duas chaves do
mesmo objeto dizem se o que variou foi o shader ou o estado.

***

### material

> **material**: `string`

Defined in: [src/core/PipelineBirthLog.ts:21](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PipelineBirthLog.ts#L21)

Nome do material, ou o `type`.

***

### ms

> **ms**: `number`

Defined in: [src/core/PipelineBirthLog.ts:27](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PipelineBirthLog.ts#L27)

Duração da criação (ms), com a compilação síncrona do host.

***

### object

> **object**: `string`

Defined in: [src/core/PipelineBirthLog.ts:19](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PipelineBirthLog.ts#L19)

Nome do objeto, ou do ancestral nomeado mais próximo, ou o `type`.

***

### transparent

> **transparent**: `boolean`

Defined in: [src/core/PipelineBirthLog.ts:23](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/PipelineBirthLog.ts#L23)

Variante translúcida — nasce quando um material muda de opaco para translúcido.
