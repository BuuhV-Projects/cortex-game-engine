[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / EditorOutlinerOptions

# Interface: EditorOutlinerOptions

Defined in: src/editor/EditorOutliner.ts:14

## Properties

### editRoots

> **editRoots**: `Object3D`\<`Object3DEventMap`\>[]

Defined in: src/editor/EditorOutliner.ts:16

Raízes cujos filhos diretos (nomeados) são listados. Ex.: `[scene.getThreeScene()]`.

***

### onFocus?

> `optional` **onFocus?**: (`obj`) => `void`

Defined in: src/editor/EditorOutliner.ts:20

Chamado ao clicar num item — ligue ao `EditorCameraSystem.focusOn` pra enquadrar.

#### Parameters

##### obj

`Object3D`

#### Returns

`void`

***

### parent?

> `optional` **parent?**: `HTMLElement`

Defined in: src/editor/EditorOutliner.ts:22

Onde anexar o painel. Default `document.body`.

***

### selection

> **selection**: [`EditorSelection`](EditorSelection.md)

Defined in: src/editor/EditorOutliner.ts:18

Ponte de seleção compartilhada (mesma instância passada ao ObjectEditSystem).
