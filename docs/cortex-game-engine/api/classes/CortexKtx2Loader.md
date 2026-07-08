[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / CortexKtx2Loader

# Class: CortexKtx2Loader

Defined in: [src/core/loadKtx2.ts:127](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/loadKtx2.ts#L127)

Loader de KTX2 no formato que o `GLTFLoader` do three espera
(`setKTX2Loader`) — carrega as texturas **embutidas em GLB** (extensão
`KHR_texture_basisu`). Dois caminhos, escolhidos por ambiente (ADR-0108):
- host nativo → transcoder C++ ([loadKtx2Native](../functions/loadKtx2Native.md)), sem renderer;
- browser/Studio → `KTX2Loader` do three (WASM), com `detectSupport` do
  renderer registrado em [setKtx2Renderer](../functions/setKtx2Renderer.md).

O `GLTFLoader` passa uma URL `blob:` (bytes da textura no bufferView) — o
mesmo mecanismo que já carrega PNG embutido no host (M1).

## Extends

- `Loader`

## Constructors

### Constructor

> **new CortexKtx2Loader**(`manager?`): `CortexKtx2Loader`

Defined in: [src/core/loadKtx2.ts:130](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/loadKtx2.ts#L130)

#### Parameters

##### manager?

`LoadingManager`

#### Returns

`CortexKtx2Loader`

#### Overrides

`Loader.constructor`

## Methods

### dispose()

> **dispose**(): `this`

Defined in: [src/core/loadKtx2.ts:158](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/loadKtx2.ts#L158)

#### Returns

`this`

***

### load()

> **load**(`url`, `onLoad`, `onProgress?`, `onError?`): `void`

Defined in: [src/core/loadKtx2.ts:143](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/loadKtx2.ts#L143)

Chamado pelo GLTFLoader por textura KTX2. `url` é um `blob:` (bufferView).

#### Parameters

##### url

`string`

##### onLoad

(`texture`) => `void`

##### onProgress?

(`event`) => `void`

##### onError?

(`err`) => `void`

#### Returns

`void`

#### Overrides

`Loader.load`
