[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / DialogueView

# Interface: DialogueView

Defined in: [.claude/worktrees/feat-input-rebind/src/dialogue/DialogueRunner.ts:12](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/dialogue/DialogueRunner.ts#L12)

O que a UI precisa pra desenhar o estado atual da conversa. Imutável: cada
transição produz um novo DialogueView.

## Properties

### choices

> **choices**: `object`[]

Defined in: [.claude/worktrees/feat-input-rebind/src/dialogue/DialogueRunner.ts:23](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/dialogue/DialogueRunner.ts#L23)

Escolhas **visíveis** (já filtradas por `requires`), com o índice **original**
na lista do nó — passe esse índice de volta pra [DialogueRunner.choose](../classes/DialogueRunner.md#choose).

#### index

> **index**: `number`

#### text

> **text**: `string`

***

### isLine

> **isLine**: `boolean`

Defined in: [.claude/worktrees/feat-input-rebind/src/dialogue/DialogueRunner.ts:25](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/dialogue/DialogueRunner.ts#L25)

`true` quando é uma **linha simples** (sem escolhas) — avança com `advance()`.

***

### nodeId

> **nodeId**: `string`

Defined in: [.claude/worktrees/feat-input-rebind/src/dialogue/DialogueRunner.ts:14](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/dialogue/DialogueRunner.ts#L14)

Nó atual (id).

***

### speaker?

> `optional` **speaker?**: `string`

Defined in: [.claude/worktrees/feat-input-rebind/src/dialogue/DialogueRunner.ts:16](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/dialogue/DialogueRunner.ts#L16)

Quem fala (se houver).

***

### text

> **text**: `string`

Defined in: [.claude/worktrees/feat-input-rebind/src/dialogue/DialogueRunner.ts:18](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/dialogue/DialogueRunner.ts#L18)

Texto da fala.
