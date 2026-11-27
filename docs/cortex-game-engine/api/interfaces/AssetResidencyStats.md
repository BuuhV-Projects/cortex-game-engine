[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / AssetResidencyStats

# Interface: AssetResidencyStats

Defined in: [src/core/AssetResidency.ts:110](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetResidency.ts#L110)

Contadores da residência ([AssetResidency.stats](../classes/AssetResidency.md#stats)).

## Properties

### budgetBytes

> **budgetBytes**: `number`

Defined in: [src/core/AssetResidency.ts:116](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetResidency.ts#L116)

O orçamento configurado.

***

### bytes

> **bytes**: `number`

Defined in: [src/core/AssetResidency.ts:114](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetResidency.ts#L114)

Bytes estimados dos residentes.

***

### evictions

> **evictions**: `number`

Defined in: [src/core/AssetResidency.ts:120](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetResidency.ts#L120)

URLs soltas pelo `trim()` ou pelo `release()`.

***

### loads

> **loads**: `number`

Defined in: [src/core/AssetResidency.ts:118](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetResidency.ts#L118)

Cargas que chegaram (contadas uma vez por chegada; recarga após descarte conta de novo).

***

### overBudget

> **overBudget**: `number`

Defined in: [src/core/AssetResidency.ts:122](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetResidency.ts#L122)

Vezes que o `trim()` terminou acima do orçamento porque tudo estava em uso ou seguro.

***

### resident

> **resident**: `number`

Defined in: [src/core/AssetResidency.ts:112](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetResidency.ts#L112)

URLs residentes agora.
