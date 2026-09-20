[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / SubtreeMergeOptions

# Interface: SubtreeMergeOptions

Defined in: [.claude/worktrees/perf-boot-nativo/src/scene/StaticMerge.ts:386](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/StaticMerge.ts#L386)

Opções da [mergeSubtree](../functions/mergeSubtree.md).

## Properties

### name?

> `optional` **name?**: `string`

Defined in: [.claude/worktrees/perf-boot-nativo/src/scene/StaticMerge.ts:394](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/StaticMerge.ts#L394)

Prefixo do nome das malhas geradas (diagnóstico). Default: `merged`.

***

### preserve?

> `optional` **preserve?**: `Iterable`\<`Object3D`\<`Object3DEventMap`\>, `any`, `any`\>

Defined in: [.claude/worktrees/perf-boot-nativo/src/scene/StaticMerge.ts:392](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/scene/StaticMerge.ts#L392)

Subárvores que NÃO são fundidas — pulas inteiras, com os descendentes.
É o que mantém girando o que gira: os pivôs de roda de um carro, uma torre
que rotaciona, uma porta que abre.
