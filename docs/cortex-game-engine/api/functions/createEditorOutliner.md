[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / createEditorOutliner

# Function: createEditorOutliner()

> **createEditorOutliner**(`options`): [`EditorOutliner`](../interfaces/EditorOutliner.md)

Defined in: src/editor/EditorOutliner.ts:42

Cria o painel de **hierarquia** do modo editor: lista os objetos da cena
(filhos diretos dos `editRoots`, exceto internos do editor). Clicar num item
o **seleciona** (via `selection.requestSelect`, que o [ObjectEditSystem](../classes/ObjectEditSystem.md)
atende atacando o gizmo) e o **enquadra** (via `onFocus`). O item selecionado
fica destacado, reagindo a `selection.onChange`.

É opcional/conveniência (acopla ao DOM) — comece escondido e use `setVisible`.

## Parameters

### options

[`EditorOutlinerOptions`](../interfaces/EditorOutlinerOptions.md)

## Returns

[`EditorOutliner`](../interfaces/EditorOutliner.md)

## Example

```ts
const outliner = createEditorOutliner({
  editRoots: [scene.getThreeScene()],
  selection,
  onFocus: (obj) => editorCameraSystem.focusOn(obj),
})
// ao ativar o editor: outliner.setVisible(true); outliner.refresh()
```
