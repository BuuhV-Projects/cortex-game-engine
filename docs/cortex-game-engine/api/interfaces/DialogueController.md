[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / DialogueController

# Interface: DialogueController

Defined in: [.claude/worktrees/feat-input-rebind/src/dialogue/startDialogue.ts:8](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/dialogue/startDialogue.ts#L8)

Handle de um diálogo em andamento, devolvido por [startDialogue](../functions/startDialogue.md).

## Properties

### active

> `readonly` **active**: `boolean`

Defined in: [.claude/worktrees/feat-input-rebind/src/dialogue/startDialogue.ts:10](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/dialogue/startDialogue.ts#L10)

`true` enquanto a conversa está aberta. Use em `system.pauseWhen`.

## Methods

### stop()

> **stop**(): `void`

Defined in: [.claude/worktrees/feat-input-rebind/src/dialogue/startDialogue.ts:12](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/dialogue/startDialogue.ts#L12)

Encerra e remove a UI imediatamente (ex.: ESC, troca de cena).

#### Returns

`void`
