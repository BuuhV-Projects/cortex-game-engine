[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / AssetResidencyStats

# Interface: AssetResidencyStats

Defined in: [src/core/AssetResidency.ts:125](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetResidency.ts#L125)

Contadores da residência ([AssetResidency.stats](../classes/AssetResidency.md#stats)).

## Properties

### budgetBytes

> **budgetBytes**: `number`

Defined in: [src/core/AssetResidency.ts:131](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetResidency.ts#L131)

O orçamento configurado.

***

### bytes

> **bytes**: `number`

Defined in: [src/core/AssetResidency.ts:129](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetResidency.ts#L129)

Bytes estimados dos residentes.

***

### evictions

> **evictions**: `number`

Defined in: [src/core/AssetResidency.ts:135](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetResidency.ts#L135)

URLs soltas pelo `trim()` ou pelo `release()`.

***

### loads

> **loads**: `number`

Defined in: [src/core/AssetResidency.ts:133](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetResidency.ts#L133)

Cargas que chegaram (contadas uma vez por chegada; recarga após descarte conta de novo).

***

### overBudget

> **overBudget**: `number`

Defined in: [src/core/AssetResidency.ts:137](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetResidency.ts#L137)

Vezes que o `trim()` terminou acima do orçamento porque tudo estava em uso ou seguro.

***

### resident

> **resident**: `number`

Defined in: [src/core/AssetResidency.ts:127](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetResidency.ts#L127)

URLs residentes agora.
