[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / yieldOnBudget

# Function: yieldOnBudget()

> **yieldOnBudget**(): `Promise`\<`void`\>

Defined in: .claude/worktrees/boot-cooperativo/src/core/frameYield.ts:148

Cede o frame se o orçamento estourou **e** há um carregamento em andamento.
Fora de um escopo de carga não cede nada: ver [inLoadingScope](inLoadingScope.md).

## Returns

`Promise`\<`void`\>
