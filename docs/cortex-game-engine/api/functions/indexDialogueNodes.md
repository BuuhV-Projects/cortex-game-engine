[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / indexDialogueNodes

# Function: indexDialogueNodes()

> **indexDialogueNodes**(`graph`): `Map`\<`string`, [`DialogueNode`](../type-aliases/DialogueNode.md)\>

Defined in: [.claude/worktrees/feat-input-rebind/src/dialogue/DialogueGraph.ts:108](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/dialogue/DialogueGraph.ts#L108)

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
