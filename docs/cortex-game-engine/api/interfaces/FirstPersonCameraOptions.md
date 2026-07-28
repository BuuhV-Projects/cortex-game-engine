[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / FirstPersonCameraOptions

# Interface: FirstPersonCameraOptions

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/FirstPersonCameraSystem.ts:11](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/FirstPersonCameraSystem.ts#L11)

Opções do [FirstPersonCameraSystem](../classes/FirstPersonCameraSystem.md).

## Properties

### actions?

> `optional` **actions?**: [`InputActions`](../classes/InputActions.md) \| `null`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/FirstPersonCameraSystem.ts:30](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/FirstPersonCameraSystem.ts#L30)

**Ações de input remapeáveis** (ADR-0164) — passe `game.actions` pra que
andar e pular sigam os bindings do jogador. Sem isso, valem WASD/setas e
Espaço fixos. `null` força o modo fixo mesmo indo pelo `setupFirstPerson`.

***

### eyeHeight?

> `optional` **eyeHeight?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/FirstPersonCameraSystem.ts:15](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/FirstPersonCameraSystem.ts#L15)

Altura dos olhos acima dos **pés** do personagem. Default `1.6`.

***

### moveSpeed?

> `optional` **moveSpeed?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/FirstPersonCameraSystem.ts:13](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/FirstPersonCameraSystem.ts#L13)

Velocidade de caminhada no plano (unidades/s). Default `6`.

***

### pauseWhen?

> `optional` **pauseWhen?**: () => `boolean`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/FirstPersonCameraSystem.ts:24](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/FirstPersonCameraSystem.ts#L24)

Predicado de **pausa** (ex.: `() => game.editorActive`). Quando `true`, o
sistema não move/olha (e **mostra** o mesh do player pra editar). Diferente do
`System.pauseWhen` (que o World usa pra PULAR o update): aqui o update **sempre
roda** pra poder restaurar a visibilidade do corpo ao voltar pro editor.

#### Returns

`boolean`

***

### sensitivity?

> `optional` **sensitivity?**: `number`

Defined in: [.claude/worktrees/feat-input-rebind/src/systems/FirstPersonCameraSystem.ts:17](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/systems/FirstPersonCameraSystem.ts#L17)

Sensibilidade do mouse (rad por pixel de movimento). Default `0.0022`.
