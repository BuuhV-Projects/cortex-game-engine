[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / AssetResidencyOptions

# Interface: AssetResidencyOptions

Defined in: [src/core/AssetResidency.ts:98](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetResidency.ts#L98)

Opções de [AssetResidency](../classes/AssetResidency.md).

## Properties

### budgetBytes

> **budgetBytes**: `number`

Defined in: [src/core/AssetResidency.ts:100](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetResidency.ts#L100)

Teto de bytes residentes estimados; acima dele o `trim()` solta o que está sem uso.

***

### loader?

> `optional` **loader?**: [`ResidencyLoader`](ResidencyLoader.md)

Defined in: [src/core/AssetResidency.ts:102](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetResidency.ts#L102)

Loader das cargas e dos descartes. Padrão: um [AssetLoader](../classes/AssetLoader.md) próprio da residência.

***

### onEvict?

> `optional` **onEvict?**: (`url`, `gltf`) => `void`

Defined in: [src/core/AssetResidency.ts:106](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetResidency.ts#L106)

Chamado antes do `release` de cada URL descartada, para o jogo largar o que derivou do GLTF.

#### Parameters

##### url

`string`

##### gltf

`GLTF`

#### Returns

`void`

***

### sizeOf?

> `optional` **sizeOf?**: (`gltf`) => `number`

Defined in: [src/core/AssetResidency.ts:104](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetResidency.ts#L104)

Estimativa de bytes de cada GLB, na chegada. Padrão: [estimateGltfBytes](../functions/estimateGltfBytes.md).

#### Parameters

##### gltf

`GLTF`

#### Returns

`number`
