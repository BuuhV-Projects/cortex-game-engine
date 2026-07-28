[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / parseDialogueGraph

# Function: parseDialogueGraph()

> **parseDialogueGraph**(`data`): `object`

Defined in: [.claude/worktrees/feat-input-rebind/src/dialogue/DialogueGraph.ts:85](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/dialogue/DialogueGraph.ts#L85)

Valida e normaliza um objeto cru (ex.: JSON importado) num [DialogueGraph](../type-aliases/DialogueGraph.md).
Lança `ZodError` com mensagem clara se o dado for inválido. Também checa
**integridade referencial** (start e todos os `next` apontam pra nós existentes).

## Parameters

### data

`unknown`

## Returns

### id

> **id**: `string`

Id do diálogo.

### nodes

> **nodes**: `object`[]

Nós do grafo.

### start

> **start**: `string`

Nó inicial (id).
