[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / StartDialogueOptions

# Interface: StartDialogueOptions

Defined in: [src/dialogue/startDialogue.ts:16](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/dialogue/startDialogue.ts#L16)

Opções de [startDialogue](../functions/startDialogue.md).

## Extends

- [`DialogueUIOptions`](DialogueUIOptions.md)

## Properties

### accent?

> `optional` **accent?**: `string`

Defined in: [src/dialogue/DialogueUI.ts:33](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/dialogue/DialogueUI.ts#L33)

#### Inherited from

[`DialogueUIOptions`](DialogueUIOptions.md).[`accent`](DialogueUIOptions.md#accent)

***

### advanceKeys?

> `optional` **advanceKeys?**: `string`[]

Defined in: [src/dialogue/startDialogue.ts:27](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/dialogue/startDialogue.ts#L27)

Teclas que avançam linhas simples. Default `['e', 'Enter', ' ']`. Escolhas
são por clique (e teclas numéricas `1..9`).

***

### onClue?

> `optional` **onClue?**: (`clueId`) => `void`

Defined in: [src/dialogue/startDialogue.ts:20](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/dialogue/startDialogue.ts#L20)

Recebe pistas concedidas (`give`) — ligue ao sistema de investigação do jogo.

#### Parameters

##### clueId

`string`

#### Returns

`void`

***

### onEnd?

> `optional` **onEnd?**: () => `void`

Defined in: [src/dialogue/startDialogue.ts:22](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/dialogue/startDialogue.ts#L22)

Chamado quando a conversa termina (naturalmente ou via `stop`).

#### Returns

`void`

***

### parent?

> `optional` **parent?**: `HTMLElement`

Defined in: [src/dialogue/DialogueUI.ts:32](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/dialogue/DialogueUI.ts#L32)

#### Inherited from

[`DialogueUIOptions`](DialogueUIOptions.md).[`parent`](DialogueUIOptions.md#parent)

***

### story?

> `optional` **story?**: [`StoryState`](../classes/StoryState.md)

Defined in: [src/dialogue/startDialogue.ts:18](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/dialogue/startDialogue.ts#L18)

Estado de história pra `requires`/`set`.

***

### ui?

> `optional` **ui?**: [`UiLayer`](../classes/UiLayer.md)

Defined in: [src/dialogue/startDialogue.ts:32](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/dialogue/startDialogue.ts#L32)

`game.ui` — usa a UI de runtime (ADR-0102): funciona no console e as
escolhas ficam navegáveis por d-pad/A. Sem isso, DOM legado (browser).
