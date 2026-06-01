[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / HttpSceneFileWriter

# Class: HttpSceneFileWriter

Defined in: [src/io/HttpSceneFileWriter.ts:9](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/io/HttpSceneFileWriter.ts#L9)

Escreve o `SceneFileV1` via POST para um endpoint do dev server (Vite), que
grava o arquivo em disco. Pareia com `createSceneSavePlugin`
(cortex-game-engine/vite — plugin Node-only). Só funciona em `vite dev`.

## Implements

- [`SceneFileWriter`](../interfaces/SceneFileWriter.md)

## Constructors

### Constructor

> **new HttpSceneFileWriter**(`url?`): `HttpSceneFileWriter`

Defined in: [src/io/HttpSceneFileWriter.ts:10](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/io/HttpSceneFileWriter.ts#L10)

#### Parameters

##### url?

`string` = `'/__save-scene-data'`

#### Returns

`HttpSceneFileWriter`

## Methods

### save()

> **save**(`file`): `Promise`\<`void`\>

Defined in: [src/io/HttpSceneFileWriter.ts:12](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/io/HttpSceneFileWriter.ts#L12)

#### Parameters

##### file

[`SceneFileV1`](../interfaces/SceneFileV1.md)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`SceneFileWriter`](../interfaces/SceneFileWriter.md).[`save`](../interfaces/SceneFileWriter.md#save)
