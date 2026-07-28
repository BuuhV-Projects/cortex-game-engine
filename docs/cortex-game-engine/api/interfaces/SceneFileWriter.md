[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / SceneFileWriter

# Interface: SceneFileWriter

Defined in: [.claude/worktrees/feat-input-rebind/src/io/SceneFileWriter.ts:7](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/io/SceneFileWriter.ts#L7)

Abstração de escrita do `SceneFileV1`. No browser puro não dá pra gravar
arquivo do projeto — daí as implementações: HTTP (Vite dev) e Tauri (build).

## Methods

### save()

> **save**(`file`): `Promise`\<`void`\>

Defined in: [.claude/worktrees/feat-input-rebind/src/io/SceneFileWriter.ts:8](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/io/SceneFileWriter.ts#L8)

#### Parameters

##### file

[`SceneFileV1`](SceneFileV1.md)

#### Returns

`Promise`\<`void`\>
