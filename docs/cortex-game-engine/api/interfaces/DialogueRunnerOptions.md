[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / DialogueRunnerOptions

# Interface: DialogueRunnerOptions

Defined in: src/dialogue/DialogueRunner.ts:29

Opções do [DialogueRunner](../classes/DialogueRunner.md).

## Properties

### onClue?

> `optional` **onClue?**: (`clueId`) => `void`

Defined in: src/dialogue/DialogueRunner.ts:33

Chamado quando um nó/escolha concede uma pista (`give`). O jogo decide o efeito.

#### Parameters

##### clueId

`string`

#### Returns

`void`

***

### story?

> `optional` **story?**: [`StoryState`](../classes/StoryState.md)

Defined in: src/dialogue/DialogueRunner.ts:31

Estado de história pra `requires`/`set` (criado vazio se omitido).
