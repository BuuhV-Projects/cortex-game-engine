[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / createEditorInspector

# Function: createEditorInspector()

> **createEditorInspector**(`options`): [`EditorInspector`](../interfaces/EditorInspector.md)

Defined in: src/editor/EditorInspector.ts:40

Cria o painel de **propriedades** (inspector) do modo editor. Mostra e edita o
objeto selecionado, reagindo a `selection.onChange` (reconstrói os campos) e
`selection.onTransform` (atualiza os valores ao vivo enquanto o gizmo arrasta).

Campos:
- Qualquer objeto: posição (x/y/z), rotação (graus), escala (x/y/z).
- Sombra: projeta/recebe (via [setShadows](setShadows.md)).
- Luz: intensidade, cor e intensidade da sombra.

Opcional/conveniência (acopla ao DOM) — comece escondido e use `setVisible`.

## Parameters

### options

[`EditorInspectorOptions`](../interfaces/EditorInspectorOptions.md)

## Returns

[`EditorInspector`](../interfaces/EditorInspector.md)
