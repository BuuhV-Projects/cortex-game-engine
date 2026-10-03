[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / CortexKtx2Loader

# Class: CortexKtx2Loader

Defined in: [src/core/loadKtx2.ts:208](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/loadKtx2.ts#L208)

Loader de KTX2 no formato que o `GLTFLoader` do three espera (`setKTX2Loader`)
— carrega as texturas **embutidas em GLB** (`KHR_texture_basisu`). O
`GLTFLoader` passa uma URL `blob:` (bytes do bufferView), o mesmo mecanismo
que já carrega PNG embutido no host (M1) e no navegador.

## Extends

- `Loader`

## Constructors

### Constructor

> **new CortexKtx2Loader**(`manager?`): `CortexKtx2Loader`

Defined in: [src/core/loadKtx2.ts:209](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/loadKtx2.ts#L209)

#### Parameters

##### manager?

`LoadingManager`

#### Returns

`CortexKtx2Loader`

#### Overrides

`Loader.constructor`

## Methods

### load()

> **load**(`url`, `onLoad`, `_onProgress?`, `onError?`): `void`

Defined in: [src/core/loadKtx2.ts:214](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/loadKtx2.ts#L214)

Chamado pelo GLTFLoader por textura KTX2. `url` é um `blob:` (bufferView).

#### Parameters

##### url

`string`

##### onLoad

(`texture`) => `void`

##### \_onProgress?

(`event`) => `void`

##### onError?

(`err`) => `void`

#### Returns

`void`

#### Overrides

`Loader.load`
