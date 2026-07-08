[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / setKtx2TranscoderPath

# Function: setKtx2TranscoderPath()

> **setKtx2TranscoderPath**(`path`): `void`

Defined in: [src/core/loadKtx2.ts:79](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/loadKtx2.ts#L79)

Define onde o `KTX2Loader` do three acha o transcoder Basis (WASM) no
**browser/Studio**. Copie `three/examples/jsm/libs/basis/*` pra esse caminho
servido. No host nativo é ignorado (usa o transcoder C++). Default: `"basis/"`.

## Parameters

### path

`string`

## Returns

`void`
