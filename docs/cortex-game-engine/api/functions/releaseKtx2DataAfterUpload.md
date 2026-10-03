[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / releaseKtx2DataAfterUpload

# Function: releaseKtx2DataAfterUpload()

> **releaseKtx2DataAfterUpload**(`root`): `void`

Defined in: [src/core/loadKtx2.ts:107](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/loadKtx2.ts#L107)

Solta os dados em CPU dos mips KTX2 nativos de `root` depois que a GPU os
recebe (SPEC-0286). O GLTFLoader cria um clone da textura por material e os
clones compartilham os objetos de mip; por isso os dados só somem quando
TODAS as texturas que apontam pro mesmo mip já subiram. Textura nunca
desenhada mantém os dados (ainda pode subir depois).

Depois de liberada, a textura não pode ser reenviada (`needsUpdate`).

## Parameters

### root

`Object3D`

## Returns

`void`
