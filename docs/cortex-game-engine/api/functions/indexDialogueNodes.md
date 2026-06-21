[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / indexDialogueNodes

# Function: indexDialogueNodes()

> **indexDialogueNodes**(`graph`): `Map`\<`string`, [`DialogueNode`](../type-aliases/DialogueNode.md)\>

Defined in: src/dialogue/DialogueGraph.ts:107

Indexa os nós por id pra lookup O(1).

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

## Returns

`Map`\<`string`, [`DialogueNode`](../type-aliases/DialogueNode.md)\>
