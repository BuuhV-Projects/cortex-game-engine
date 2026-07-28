[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / HttpSceneFileWriter

# Class: HttpSceneFileWriter

Defined in: [.claude/worktrees/feat-input-rebind/src/io/HttpSceneFileWriter.ts:13](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/io/HttpSceneFileWriter.ts#L13)

Escreve o `SceneFileV1` via POST para um endpoint do dev server (Vite), que
grava o arquivo em disco. Pareia com `createSceneSavePlugin`
(cortex-game-engine/vite — plugin Node-only). Só funciona em `vite dev`.

`path` (opcional) escolhe o arquivo de destino, relativo à raiz do projeto
(ex.: `assets/scene-data-fase2.json` — overlay por fase). Sem `path`, o
plugin grava no `target` configurado nele (default `assets/scene-data.json`).

## Implements

- [`SceneFileWriter`](../interfaces/SceneFileWriter.md)

## Constructors

### Constructor

> **new HttpSceneFileWriter**(`url?`, `path?`): `HttpSceneFileWriter`

Defined in: [.claude/worktrees/feat-input-rebind/src/io/HttpSceneFileWriter.ts:14](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/io/HttpSceneFileWriter.ts#L14)

#### Parameters

##### url?

`string` = `'/__save-scene-data'`

##### path?

`string`

#### Returns

`HttpSceneFileWriter`

## Methods

### save()

> **save**(`file`): `Promise`\<`void`\>

Defined in: [.claude/worktrees/feat-input-rebind/src/io/HttpSceneFileWriter.ts:19](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/io/HttpSceneFileWriter.ts#L19)

#### Parameters

##### file

[`SceneFileV1`](../interfaces/SceneFileV1.md)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`SceneFileWriter`](../interfaces/SceneFileWriter.md).[`save`](../interfaces/SceneFileWriter.md#save)
