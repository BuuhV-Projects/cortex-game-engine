[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / disposeObjectResources

# Function: disposeObjectResources()

> **disposeObjectResources**(`root`, `options?`): `void`

Defined in: [src/core/AssetLoader.ts:70](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/AssetLoader.ts#L70)

Dispõe os recursos de uma árvore de objetos: geometrias (incluindo a árvore
BVH do three-mesh-bvh, se houver), materiais e texturas referenciadas. Usado
pelo despejo de caches (SPEC-0152) — o `Scene.disposeAll` cobre o que está NA
cena; isto cobre o que ficou só em cache (GLTF/FBX carregados).

Seguro chamar sobre objetos já dispostos (dispose do three é idempotente).

## Parameters

### root

`Object3D`

Raiz da árvore (a `scene` do GLTF, o grupo do FBX).

### options?

[`DisposeObjectResourcesOptions`](../interfaces/DisposeObjectResourcesOptions.md)

`closeImages: true` fecha também as imagens decodificadas (SPEC-0753).

## Returns

`void`
