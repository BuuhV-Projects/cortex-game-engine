[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / BuildProgress

# Interface: BuildProgress

Defined in: [.claude/worktrees/boot-cooperativo/src/scene/SceneBuilder.ts:182](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L182)

Progresso da montagem da cena (SPEC-0219).

## Properties

### done

> **done**: `number`

Defined in: [.claude/worktrees/boot-cooperativo/src/scene/SceneBuilder.ts:184](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L184)

Nós já instanciados.

***

### fraction

> **fraction**: `number`

Defined in: [.claude/worktrees/boot-cooperativo/src/scene/SceneBuilder.ts:188](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L188)

Fração `0..1` da etapa de instanciação (0 fora dela, 1 depois dela).

***

### phase

> **phase**: [`BuildPhase`](../type-aliases/BuildPhase.md)

Defined in: [.claude/worktrees/boot-cooperativo/src/scene/SceneBuilder.ts:190](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L190)

Em que etapa o build está.

***

### total

> **total**: `number`

Defined in: [.claude/worktrees/boot-cooperativo/src/scene/SceneBuilder.ts:186](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneBuilder.ts#L186)

Total de nós a instanciar.
