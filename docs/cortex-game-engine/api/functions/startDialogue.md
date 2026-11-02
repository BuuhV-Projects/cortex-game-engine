[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / startDialogue

# Function: startDialogue()

> **startDialogue**(`graph`, `options?`): [`DialogueController`](../interfaces/DialogueController.md)

Defined in: [src/dialogue/startDialogue.ts:47](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/dialogue/startDialogue.ts#L47)

Abre um diálogo: conecta [DialogueRunner](../classes/DialogueRunner.md) (lógica) + [createDialogueUI](createDialogueUI.md)
(DOM) + teclado, e devolve um [DialogueController](../interfaces/DialogueController.md) (ADR-0070).

O gameplay deve **pausar** enquanto `controller.active` — fie seus sistemas com
`pauseWhen: () => controller.active` (ou um flag global). O input de jogo (WASD/
mouse-look) deve ignorar enquanto ativo; este helper só captura o teclado da UI.

## Parameters

### graph

#### id

`string` = `...`

Id do diálogo.

#### nodes

`object`[] = `...`

Nós do grafo.

#### start

`string` = `...`

Nó inicial (id).

### options?

[`StartDialogueOptions`](../interfaces/StartDialogueOptions.md) = `{}`

## Returns

[`DialogueController`](../interfaces/DialogueController.md)

## Example

```ts
const dlg = startDialogue(graph, { story, onClue: (id) => caseState.collectClue(id) });
camera.pauseWhen = () => dlg.active;   // ou pause global
```
