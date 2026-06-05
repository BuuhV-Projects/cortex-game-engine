[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / instance

# Function: instance()

> **instance**(`gltf`, `shadows?`): `Object3D`

Defined in: src/scene/SceneAssets.ts:110

Clona a cena de um GLTF (seguro pra `SkinnedMesh`) e configura sombras nos
meshes. Clonar permite spawnar N cópias do mesmo GLTF carregado uma vez.

Pra um objeto **sem sombra** (não entra no shadowMap), passe
`{ castShadow: false, receiveShadow: false }` — ou ajuste depois com
[setShadows](setShadows.md).

## Parameters

### gltf

`GLTF`

O GLTF carregado (via [loadGLB](loadGLB.md)).

### shadows?

[`ShadowOptions`](../interfaces/ShadowOptions.md) = `{}`

Configuração de sombra. Default: projeta e recebe.

## Returns

`Object3D`

Um novo `Object3D` pronto pra `scene.add(...)`.
