[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / TauriSceneFileWriter

# Class: TauriSceneFileWriter

Defined in: [src/io/TauriSceneFileWriter.ts:13](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/io/TauriSceneFileWriter.ts#L13)

Escreve o `SceneFileV1` no app empacotado via Tauri, usando o plugin de FS
(`@tauri-apps/plugin-fs`, Tauri v2). Importado **dinamicamente** com um
especificador não-literal, pra que o engine NÃO tenha dependência fixa de
Tauri (jogos web puros não pagam por isso, e o tsc não tenta resolver).

Útil só em builds que permitem edição (ex.: `tauri:build:debug`). Cabe ao
projeto decidir o `path` e se o build de release deve ou não salvar.

## Implements

- [`SceneFileWriter`](../interfaces/SceneFileWriter.md)

## Constructors

### Constructor

> **new TauriSceneFileWriter**(`path?`): `TauriSceneFileWriter`

Defined in: [src/io/TauriSceneFileWriter.ts:14](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/io/TauriSceneFileWriter.ts#L14)

#### Parameters

##### path?

`string` = `'scene-data.json'`

#### Returns

`TauriSceneFileWriter`

## Methods

### save()

> **save**(`file`): `Promise`\<`void`\>

Defined in: [src/io/TauriSceneFileWriter.ts:16](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/io/TauriSceneFileWriter.ts#L16)

#### Parameters

##### file

[`SceneFileV1`](../interfaces/SceneFileV1.md)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`SceneFileWriter`](../interfaces/SceneFileWriter.md).[`save`](../interfaces/SceneFileWriter.md#save)
