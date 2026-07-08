[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / loadKtx2Native

# Function: loadKtx2Native()

> **loadKtx2Native**(`url`): `Promise`\<`DataTexture`\>

Defined in: src/core/loadKtx2.ts:42

Caminho NATIVO: baixa o `.ktx2`, transcoda no host (basis_universal) e monta
uma `DataTexture` RGBA. `flipY = false` (raster top-down do KTX2, igual à
convenção do `KTX2Loader` do three). `colorSpace` fica no default — o chamador
define (ex.: `SRGBColorSpace` p/ cor), igual ao `TextureLoader`.

## Parameters

### url

`string`

## Returns

`Promise`\<`DataTexture`\>
