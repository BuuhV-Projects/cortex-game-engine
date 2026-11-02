[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / FrameBudget

# Class: FrameBudget

Defined in: [src/core/frameYield.ts:50](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/frameYield.ts#L50)

Orçamento de tempo entre cessões: `maybeYield()` só cede o frame quando já
passou `budgetMs` desde a última cessão.

Um orçamento por carga (não global): duas cargas concorrentes não roubam a
fatia uma da outra, e o estado morre junto com a carga.

## Constructors

### Constructor

> **new FrameBudget**(`budgetMs?`): `FrameBudget`

Defined in: [src/core/frameYield.ts:56](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/frameYield.ts#L56)

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

Defined in: [src/core/frameYield.ts:59](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/frameYield.ts#L59)

Já passou do orçamento? (sem ceder — para decidir se vale reportar progresso)

##### Returns

`boolean`

## Methods

### maybeYield()

> **maybeYield**(): `Promise`\<`void`\>

Defined in: [src/core/frameYield.ts:68](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/frameYield.ts#L68)

Cede o frame **se** o orçamento estourou; senão devolve sem esperar.

#### Returns

`Promise`\<`void`\>

Promessa que resolve no próximo frame (ou já resolvida).

***

### reset()

> **reset**(): `void`

Defined in: [src/core/frameYield.ts:75](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/frameYield.ts#L75)

Reinicia a contagem (ex.: depois de uma etapa que já cedeu por conta).

#### Returns

`void`
