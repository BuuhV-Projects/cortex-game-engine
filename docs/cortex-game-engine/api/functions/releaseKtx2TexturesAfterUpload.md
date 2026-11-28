[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / releaseKtx2TexturesAfterUpload

# Function: releaseKtx2TexturesAfterUpload()

> **releaseKtx2TexturesAfterUpload**(`textures`): `void`

Defined in: [src/core/loadKtx2.ts:129](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/loadKtx2.ts#L129)

O mesmo que [releaseKtx2DataAfterUpload](releaseKtx2DataAfterUpload.md), para uma lista de texturas
soltas (ex.: a imagem cozida que o `loadTexture` devolve no host, SPEC-0755).
Só age nas BC7 montadas por [loadKtx2Native](loadKtx2Native.md); as demais passam reto.
Clones que dividem os mips contam juntos: os dados saem quando todos subiram.

## Parameters

### textures

`Iterable`\<`Texture`\<`unknown`, `TextureEventMap`\>\>

## Returns

`void`
