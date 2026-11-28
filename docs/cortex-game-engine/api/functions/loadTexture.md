[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / loadTexture

# Function: loadTexture()

> **loadTexture**(`url`, `pixelated?`): `Promise`\<`Texture`\<`unknown`, `TextureEventMap`\>\>

Defined in: [src/scene/SceneAssets.ts:197](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L197)

Carrega uma **textura** (png/jpg/webp) com cache por URL — para sprites 2D /
spritesheets. A textura cacheada é compartilhada; quem precisar animar
independente (cada sprite com seu recorte UV) deve cloná-la (o
[createAnimatedSprite](createAnimatedSprite.md) já faz isso).

Texturas **`.ktx2`** (Basis, ADR-0108) são roteadas pro [loadKtx2](loadKtx2.md)
(transcoder nativo no host / `KTX2Loader` no browser) — comprimidas e
portáveis pro console; o `pixelated` é ignorado (KTX2 usa linear + mipmaps).

No host nativo, uma imagem que o export cozinhou (lista `cookTextures` do
`cortex.json`, SPEC-0755) carrega pelo `.ktx2` do manifesto: volta uma
`CompressedTexture` BC7 com os mips do arquivo (`flipY = false`,
`generateMipmaps = false`), com o `pixelated` valendo e o cache pela `url`
original. Os dados BC7 saem da CPU depois do primeiro upload: depois disso, um
`needsUpdate` é ignorado (a GPU segue com a textura) e um `clone()` sobe
vazio. Por isso a textura que é clonada depois de desenhada (a folha do
[createAnimatedSprite](createAnimatedSprite.md)) fica fora da lista; a camada do terreno e a
textura de estrada têm cache próprio, sem clone (SPEC-0757). No
navegador nada muda.

## Parameters

### url

`string`

Caminho relativo à raiz do projeto (ex.: `'assets/hero.png'`).

### pixelated?

`boolean` = `true`

Nearest filter (pixel art). Default `true`. Ignorado p/ KTX2.

## Returns

`Promise`\<`Texture`\<`unknown`, `TextureEventMap`\>\>
