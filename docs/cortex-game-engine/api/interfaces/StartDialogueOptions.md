[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / StartDialogueOptions

# Interface: StartDialogueOptions

Defined in: src/dialogue/startDialogue.ts:15

Opções de [startDialogue](../functions/startDialogue.md).

## Extends

- [`DialogueUIOptions`](DialogueUIOptions.md)

## Properties

### accent?

> `optional` **accent?**: `string`

Defined in: src/dialogue/DialogueUI.ts:31

#### Inherited from

[`DialogueUIOptions`](DialogueUIOptions.md).[`accent`](DialogueUIOptions.md#accent)

***

### advanceKeys?

> `optional` **advanceKeys?**: `string`[]

Defined in: src/dialogue/startDialogue.ts:26

Teclas que avançam linhas simples. Default `['e', 'Enter', ' ']`. Escolhas
são por clique (e teclas numéricas `1..9`).

***

### onClue?

> `optional` **onClue?**: (`clueId`) => `void`

Defined in: src/dialogue/startDialogue.ts:19

Recebe pistas concedidas (`give`) — ligue ao sistema de investigação do jogo.

#### Parameters

##### clueId

`string`

#### Returns

`void`

***

### onEnd?

> `optional` **onEnd?**: () => `void`

Defined in: src/dialogue/startDialogue.ts:21

Chamado quando a conversa termina (naturalmente ou via `stop`).

#### Returns

`void`

***

### parent?

> `optional` **parent?**: `HTMLElement`

Defined in: src/dialogue/DialogueUI.ts:30

#### Inherited from

[`DialogueUIOptions`](DialogueUIOptions.md).[`parent`](DialogueUIOptions.md#parent)

***

### story?

> `optional` **story?**: [`StoryState`](../classes/StoryState.md)

Defined in: src/dialogue/startDialogue.ts:17

Estado de história pra `requires`/`set`.
