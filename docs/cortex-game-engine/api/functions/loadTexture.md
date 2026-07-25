[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / loadTexture

# Function: loadTexture()

> **loadTexture**(`url`, `pixelated?`): `Promise`\<`Texture`\<`unknown`, `TextureEventMap`\>\>

Defined in: [src/scene/SceneAssets.ts:144](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L144)

Carrega uma **textura** (png/jpg/webp) com cache por URL — para sprites 2D /
spritesheets. A textura cacheada é compartilhada; quem precisar animar
independente (cada sprite com seu recorte UV) deve cloná-la (o
[createAnimatedSprite](createAnimatedSprite.md) já faz isso).

Texturas **`.ktx2`** (Basis, ADR-0108) são roteadas pro [loadKtx2](loadKtx2.md)
(transcoder nativo no host / `KTX2Loader` no browser) — comprimidas e
portáveis pro console; o `pixelated` é ignorado (KTX2 usa linear + mipmaps).

## Parameters

### url

`string`

Caminho relativo à raiz do projeto (ex.: `'assets/hero.png'`).

### pixelated?

`boolean` = `true`

Nearest filter (pixel art). Default `true`. Ignorado p/ KTX2.

## Returns

`Promise`\<`Texture`\<`unknown`, `TextureEventMap`\>\>
