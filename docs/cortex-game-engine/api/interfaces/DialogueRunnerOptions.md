[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / DialogueRunnerOptions

# Interface: DialogueRunnerOptions

Defined in: [src/dialogue/DialogueRunner.ts:29](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/dialogue/DialogueRunner.ts#L29)

Opções do [DialogueRunner](../classes/DialogueRunner.md).

## Properties

### onClue?

> `optional` **onClue?**: (`clueId`) => `void`

Defined in: [src/dialogue/DialogueRunner.ts:33](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/dialogue/DialogueRunner.ts#L33)

Chamado quando um nó/escolha concede uma pista (`give`). O jogo decide o efeito.

#### Parameters

##### clueId

`string`

#### Returns

`void`

***

### story?

> `optional` **story?**: [`StoryState`](../classes/StoryState.md)

Defined in: [src/dialogue/DialogueRunner.ts:31](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/dialogue/DialogueRunner.ts#L31)

Estado de história pra `requires`/`set` (criado vazio se omitido).
