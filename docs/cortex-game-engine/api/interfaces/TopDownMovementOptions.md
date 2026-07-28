[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / TopDownMovementOptions

# Interface: TopDownMovementOptions

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/TopDownMovementSystem.ts:15](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/TopDownMovementSystem.ts#L15)

Opções do [TopDownMovementSystem](../classes/TopDownMovementSystem.md).

## Properties

### moveSpeed?

> `optional` **moveSpeed?**: `number` \| (() => `number`)

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/TopDownMovementSystem.ts:21](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/TopDownMovementSystem.ts#L21)

Velocidade no plano (unidades/s). Pode ser um **número fixo** ou uma **função
lida por frame** — o jogo a usa pra marchas (walk/run), zonas lentas, status, etc.
(o engine só aplica `eixo × velocidade`; a política é do jogo, ADR-0066). Default `5`.
