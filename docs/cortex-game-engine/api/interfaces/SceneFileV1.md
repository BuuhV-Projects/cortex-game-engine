[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / SceneFileV1

# Interface: SceneFileV1

Defined in: [src/scene/SceneFile.ts:12](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneFile.ts#L12)

Formato persistido da cena (estado editável: transforms de objetos por nome +
dados arbitrários do jogo). Vai junto no build (versionável no git), ao
contrário do localStorage. Ver ADR.

`data` é deliberadamente **opaco** — cada projeto guarda o que quiser (spawn,
checkpoints, hora do dia…) sem o engine precisar conhecer. O acesso tipado
fica no projeto: `const spawn = file.data.spawn as SavedSpawn`.

## Properties

### data

> **data**: `Record`\<`string`, `unknown`\>

Defined in: [src/scene/SceneFile.ts:24](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneFile.ts#L24)

Slots arbitrários do projeto. Opaco pro engine.

***

### objects

> **objects**: `Record`\<`string`, \{ `position`: \[`number`, `number`, `number`\]; `rotation`: \[`number`, `number`, `number`\]; `scale`: \[`number`, `number`, `number`\]; \}\>

Defined in: [src/scene/SceneFile.ts:15](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneFile.ts#L15)

Transform (pos/rot[euler]/scale) por `Object3D.name`.

***

### version

> **version**: `1`

Defined in: [src/scene/SceneFile.ts:13](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneFile.ts#L13)
