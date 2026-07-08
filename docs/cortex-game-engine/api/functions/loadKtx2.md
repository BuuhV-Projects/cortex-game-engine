[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / loadKtx2

# Function: loadKtx2()

> **loadKtx2**(`url`): `Promise`\<`Texture`\<`unknown`, `TextureEventMap`\>\>

Defined in: [src/core/loadKtx2.ts:68](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/loadKtx2.ts#L68)

Carrega uma textura `.ktx2` (só no host nativo). Lança se não houver
transcoder — no Studio use os assets FONTE (PNG), não KTX2.

## Parameters

### url

`string`

## Returns

`Promise`\<`Texture`\<`unknown`, `TextureEventMap`\>\>
