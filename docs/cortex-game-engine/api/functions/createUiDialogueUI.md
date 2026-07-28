[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / createUiDialogueUI

# Function: createUiDialogueUI()

> **createUiDialogueUI**(`ui`, `handlers`, `options?`): [`DialogueUI`](../interfaces/DialogueUI.md)

Defined in: [.claude/worktrees/feat-input-rebind/src/dialogue/DialogueUI.ts:42](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/dialogue/DialogueUI.ts#L42)

Diálogo sobre a **UI de runtime** (ADR-0102) — caixa inferior com fala e
escolhas nos DOIS backends; escolhas são [UiButton](../classes/UiButton.md) (d-pad + A
navegam/escolhem de graça). Texto quebra em até 4 linhas (estimativa por
largura de caractere — a API de Label é single-line).

## Parameters

### ui

[`UiLayer`](../classes/UiLayer.md)

### handlers

[`DialogueUIHandlers`](../interfaces/DialogueUIHandlers.md)

### options?

`Omit`\<[`DialogueUIOptions`](../interfaces/DialogueUIOptions.md), `"parent"`\> = `{}`

## Returns

[`DialogueUI`](../interfaces/DialogueUI.md)
