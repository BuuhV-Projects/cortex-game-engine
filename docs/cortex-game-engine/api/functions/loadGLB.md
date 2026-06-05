[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / loadGLB

# Function: loadGLB()

> **loadGLB**(`url`): `Promise`\<`GLTF`\>

Defined in: [src/scene/SceneAssets.ts:72](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/SceneAssets.ts#L72)

Carrega um `.glb`/`.gltf` (com cache por URL — chamadas repetidas reusam o
mesmo GLTF; clone com [instance](instance.md) antes de adicionar à cena).

## Parameters

### url

`string`

Caminho relativo à raiz do projeto (ex.: `'assets/tree.glb'`).

## Returns

`Promise`\<`GLTF`\>
