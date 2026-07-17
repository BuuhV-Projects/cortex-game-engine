[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / mergeStaticScene

# Function: mergeStaticScene()

> **mergeStaticScene**(`root`, `world?`, `extraDynamicRoots?`): [`StaticMergeStats`](../interfaces/StaticMergeStats.md)

Defined in: [src/scene/StaticMerge.ts:182](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/StaticMerge.ts#L182)

Funde a geometria estática sob `root` (ver doc do módulo). Idempotente na
prática (malhas fundidas têm `cortexMergedStatic` e não são re-fundidas com
ganho — mas o uso esperado é UMA vez, logo após o `buildScene`).

## Parameters

### root

`Object3D`

Raiz da cena (o `scene.getThreeScene()`).

### world?

[`World`](../classes/World.md)

Mundo ECS — usado pra excluir as subárvores de entidades dinâmicas.

### extraDynamicRoots?

`Iterable`\<`Object3D`\<`Object3DEventMap`\>\> = `[]`

Subárvores adicionais a preservar (ex.: objetos com
  `SceneAnimator` — o mixer anima aquelas malhas).

## Returns

[`StaticMergeStats`](../interfaces/StaticMergeStats.md)

## Example

```ts
const handle = await buildScene(scene, defs, { world });
mergeStaticScene(scene.getThreeScene(), game.world); // export/Play sem editor
```
