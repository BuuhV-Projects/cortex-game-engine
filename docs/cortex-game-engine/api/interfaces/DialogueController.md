[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / DialogueController

# Interface: DialogueController

Defined in: [src/dialogue/startDialogue.ts:7](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/dialogue/startDialogue.ts#L7)

Handle de um diálogo em andamento, devolvido por [startDialogue](../functions/startDialogue.md).

## Properties

### active

> `readonly` **active**: `boolean`

Defined in: [src/dialogue/startDialogue.ts:9](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/dialogue/startDialogue.ts#L9)

`true` enquanto a conversa está aberta. Use em `system.pauseWhen`.

## Methods

### stop()

> **stop**(): `void`

Defined in: [src/dialogue/startDialogue.ts:11](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/dialogue/startDialogue.ts#L11)

Encerra e remove a UI imediatamente (ex.: ESC, troca de cena).

#### Returns

`void`
