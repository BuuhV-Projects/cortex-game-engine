[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / loadKtx2Native

# Function: loadKtx2Native()

> **loadKtx2Native**(`url`): `Promise`\<`Texture`\<`unknown`, `TextureEventMap`\>\>

Defined in: [src/core/loadKtx2.ts:48](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/loadKtx2.ts#L48)

Baixa o `.ktx2`, transcoda no host (basis_universal) e monta uma `DataTexture`
RGBA. `flipY = false` (raster top-down do KTX2). `colorSpace` fica no default —
o chamador define (ex.: `SRGBColorSpace` p/ cor), igual ao `TextureLoader`.

## Parameters

### url

`string`

## Returns

`Promise`\<`Texture`\<`unknown`, `TextureEventMap`\>\>
