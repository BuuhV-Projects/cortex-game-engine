[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / DialogueController

# Interface: DialogueController

Defined in: src/dialogue/startDialogue.ts:7

Handle de um diálogo em andamento, devolvido por [startDialogue](../functions/startDialogue.md).

## Properties

### active

> `readonly` **active**: `boolean`

Defined in: src/dialogue/startDialogue.ts:9

`true` enquanto a conversa está aberta. Use em `system.pauseWhen`.

## Methods

### stop()

> **stop**(): `void`

Defined in: src/dialogue/startDialogue.ts:11

Encerra e remove a UI imediatamente (ex.: ESC, troca de cena).

#### Returns

`void`
