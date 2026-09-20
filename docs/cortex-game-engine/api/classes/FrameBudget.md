[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / FrameBudget

# Class: FrameBudget

Defined in: .claude/worktrees/boot-cooperativo/src/core/frameYield.ts:50

Orçamento de tempo entre cessões: `maybeYield()` só cede o frame quando já
passou `budgetMs` desde a última cessão.

Um orçamento por carga (não global): duas cargas concorrentes não roubam a
fatia uma da outra, e o estado morre junto com a carga.

## Constructors

### Constructor

> **new FrameBudget**(`budgetMs?`): `FrameBudget`

Defined in: .claude/worktrees/boot-cooperativo/src/core/frameYield.ts:56

#### Parameters

##### budgetMs?

`number` = `DEFAULT_BUDGET_MS`

Trabalho entre cessões, em ms.

#### Returns

`FrameBudget`

#### Default

```ts
100
```

## Accessors

### expired

#### Get Signature

> **get** **expired**(): `boolean`

Defined in: .claude/worktrees/boot-cooperativo/src/core/frameYield.ts:59

Já passou do orçamento? (sem ceder — para decidir se vale reportar progresso)

##### Returns

`boolean`

## Methods

### maybeYield()

> **maybeYield**(): `Promise`\<`void`\>

Defined in: .claude/worktrees/boot-cooperativo/src/core/frameYield.ts:68

Cede o frame **se** o orçamento estourou; senão devolve sem esperar.

#### Returns

`Promise`\<`void`\>

Promessa que resolve no próximo frame (ou já resolvida).

***

### reset()

> **reset**(): `void`

Defined in: .claude/worktrees/boot-cooperativo/src/core/frameYield.ts:75

Reinicia a contagem (ex.: depois de uma etapa que já cedeu por conta).

#### Returns

`void`
