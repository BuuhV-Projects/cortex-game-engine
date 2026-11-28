[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / DisposeObjectResourcesOptions

# Interface: DisposeObjectResourcesOptions

Defined in: [src/core/AssetLoader.ts:39](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetLoader.ts#L39)

Opções de [disposeObjectResources](../functions/disposeObjectResources.md).

## Properties

### closeImages?

> `optional` **closeImages?**: `boolean`

Defined in: [src/core/AssetLoader.ts:45](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetLoader.ts#L45)

Fecha também a imagem decodificada de cada textura (`texture.source.data.close?.()`: o `ImageBitmap` do
navegador, o bitmap do shim no host nativo, SPEC-0748), que o `dispose()` do three deixa para o GC
(SPEC-0753). Só peça quando ninguém mais usa as texturas: imagem fechada não sobe para a GPU de novo.
