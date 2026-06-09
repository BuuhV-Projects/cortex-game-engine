[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / loadTexture

# Function: loadTexture()

> **loadTexture**(`url`, `pixelated?`): `Promise`\<`Texture`\<`unknown`, `TextureEventMap`\>\>

Defined in: [src/scene/SceneAssets.ts:91](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L91)

Carrega uma **textura** (png/jpg/webp) com cache por URL — para sprites 2D /
spritesheets. A textura cacheada é compartilhada; quem precisar animar
independente (cada sprite com seu recorte UV) deve cloná-la (o
[createAnimatedSprite](createAnimatedSprite.md) já faz isso).

## Parameters

### url

`string`

Caminho relativo à raiz do projeto (ex.: `'assets/hero.png'`).

### pixelated?

`boolean` = `true`

Nearest filter (pixel art). Default `true`.

## Returns

`Promise`\<`Texture`\<`unknown`, `TextureEventMap`\>\>
