[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / ResidencyLoader

# Interface: ResidencyLoader

Defined in: [src/core/AssetResidency.ts:92](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetResidency.ts#L92)

O que a residência usa do loader: carregar um GLB e soltá-lo. O [AssetLoader](../classes/AssetLoader.md) cumpre.

## Methods

### loadGLTF()

> **loadGLTF**(`url`): `Promise`\<`GLTF`\>

Defined in: [src/core/AssetResidency.ts:94](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetResidency.ts#L94)

Carrega (ou devolve o já carregado) o GLB da URL.

#### Parameters

##### url

`string`

#### Returns

`Promise`\<`GLTF`\>

***

### release()

> **release**(`url`): `boolean`

Defined in: [src/core/AssetResidency.ts:96](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetResidency.ts#L96)

Solta o GLB da URL (dispõe e fecha as imagens); `false` se não estava pronto.

#### Parameters

##### url

`string`

#### Returns

`boolean`
