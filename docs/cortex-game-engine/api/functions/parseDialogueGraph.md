[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / parseDialogueGraph

# Function: parseDialogueGraph()

> **parseDialogueGraph**(`data`): `object`

Defined in: src/dialogue/DialogueGraph.ts:84

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
