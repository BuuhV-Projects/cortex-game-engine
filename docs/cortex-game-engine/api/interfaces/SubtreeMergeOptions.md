[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / SubtreeMergeOptions

# Interface: SubtreeMergeOptions

Defined in: [src/scene/StaticMerge.ts:417](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/StaticMerge.ts#L417)

Opções da [mergeSubtree](../functions/mergeSubtree.md).

## Properties

### name?

> `optional` **name?**: `string`

Defined in: [src/scene/StaticMerge.ts:425](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/StaticMerge.ts#L425)

Prefixo do nome das malhas geradas (diagnóstico). Default: `merged`.

***

### preserve?

> `optional` **preserve?**: `Iterable`\<`Object3D`\<`Object3DEventMap`\>, `any`, `any`\>

Defined in: [src/scene/StaticMerge.ts:423](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/StaticMerge.ts#L423)

Subárvores que NÃO são fundidas — pulas inteiras, com os descendentes.
É o que mantém girando o que gira: os pivôs de roda de um carro, uma torre
que rotaciona, uma porta que abre.
