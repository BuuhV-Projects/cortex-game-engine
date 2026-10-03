[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / loadKtx2Native

# Function: loadKtx2Native()

> **loadKtx2Native**(`url`): `Promise`\<`Texture`\<`unknown`, `TextureEventMap`\>\>

Defined in: [src/core/loadKtx2.ts:139](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/loadKtx2.ts#L139)

Baixa o `.ktx2`, transcoda no host (basis_universal — num worker quando o host
expõe `__cortexTranscodeKtx2Async`, SPEC-0287) e monta a textura (BC7
`CompressedTexture` ou `DataTexture` RGBA). `flipY = false` (raster top-down
do KTX2). `colorSpace` fica no default — o chamador define (ex.: `SRGBColorSpace` p/ cor), igual ao `TextureLoader`.

## Parameters

### url

`string`

## Returns

`Promise`\<`Texture`\<`unknown`, `TextureEventMap`\>\>
