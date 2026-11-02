[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / BuildProgress

# Interface: BuildProgress

Defined in: [src/scene/SceneBuilder.ts:185](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L185)

Progresso da montagem da cena (SPEC-0219).

## Properties

### done

> **done**: `number`

Defined in: [src/scene/SceneBuilder.ts:187](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L187)

Nós já instanciados.

***

### fraction

> **fraction**: `number`

Defined in: [src/scene/SceneBuilder.ts:191](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L191)

Fração `0..1` da etapa de instanciação (0 fora dela, 1 depois dela).

***

### phase

> **phase**: [`BuildPhase`](../type-aliases/BuildPhase.md)

Defined in: [src/scene/SceneBuilder.ts:193](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L193)

Em que etapa o build está.

***

### total

> **total**: `number`

Defined in: [src/scene/SceneBuilder.ts:189](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L189)

Total de nós a instanciar.
