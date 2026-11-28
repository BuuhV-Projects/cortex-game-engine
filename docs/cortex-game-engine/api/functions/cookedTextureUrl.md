[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / cookedTextureUrl

# Function: cookedTextureUrl()

> **cookedTextureUrl**(`url`): `Promise`\<`string` \| `null`\>

Defined in: [src/scene/cookedTextures.ts:67](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/cookedTextures.ts#L67)

A URL do `.ktx2` que o export cozinhou para a imagem `url`, ou `null` quando
ela não está na lista `cookTextures` do jogo, quando o manifesto falta ou fora
do host nativo (no navegador, sempre `null`).

É assíncrona: a primeira chamada lê o manifesto do pak (uma vez por sessão) e
as seguintes respondem do que já foi lido. O `loadTexture` público já faz essa
troca sozinho; use esta função só quando carregar a imagem por outro caminho.

## Parameters

### url

`string`

A URL do original, como o jogo a pede (ex.: `'assets/sky/dia.png'`).

## Returns

`Promise`\<`string` \| `null`\>

A URL do `.ktx2` cozido ou `null`.

## Example

```ts
const ktx2 = await cookedTextureUrl('assets/vehicles/paint/red.png')
const tex = ktx2 ? await loadKtx2(ktx2) : await new AssetLoader().loadTexture('assets/vehicles/paint/red.png')
```
