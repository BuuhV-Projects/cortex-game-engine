[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / SceneLoader

# Class: SceneLoader

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/SceneLoader.ts:8](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneLoader.ts#L8)

Carrega e aplica arquivos de cena (`SceneFileV1`). Leitura é leve (fetch +
parse validado); aplicação percorre o grafo por `Object3D.name`.

## Constructors

### Constructor

> **new SceneLoader**(): `SceneLoader`

#### Returns

`SceneLoader`

## Methods

### applyToRoot()

> **applyToRoot**(`root`, `file`): `object`

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/SceneLoader.ts:28](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneLoader.ts#L28)

Aplica as transforms salvas aos objetos de `root` cujo `name` bate com uma
chave em `file.objects`. Retorna quantos objetos foram afetados.

#### Parameters

##### root

`Object3D`

##### file

[`SceneFileV1`](../interfaces/SceneFileV1.md)

#### Returns

`object`

##### applied

> **applied**: `number`

***

### loadSceneFile()

> **loadSceneFile**(`url`): `Promise`\<[`SceneFileV1`](../interfaces/SceneFileV1.md) \| `null`\>

Defined in: [.claude/worktrees/feat-input-rebind/src/scene/SceneLoader.ts:13](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneLoader.ts#L13)

Faz fetch + parse de um `scene-data.json`. Retorna `null` se o arquivo não
existir (404) ou for inválido — o chamador deve cair pros defaults do código.

#### Parameters

##### url

`string`

#### Returns

`Promise`\<[`SceneFileV1`](../interfaces/SceneFileV1.md) \| `null`\>
