[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / EditorSelection

# Interface: EditorSelection

Defined in: src/editor/EditorSelection.ts:17

Ponte de seleção observável do modo editor — desacopla quem **pede** seleção
(painéis de UI, ex.: a hierarquia) de quem é **dono** dela (o
[ObjectEditSystem](../classes/ObjectEditSystem.md), que ataca o gizmo). É um objeto compartilhado, no
mesmo espírito do [EditorState](EditorState.md): todos recebem a mesma instância.

Fluxo (sem loop de eventos):
- Painel → sistema: `requestSelect(obj)` (o sistema escuta via `onSelectRequest`).
- Sistema → painéis: `setCurrent(obj)` atualiza `current` e dispara `onChange`.
- Sistema → inspector: `emitTransform()` quando o gizmo move o selecionado.

Só o [ObjectEditSystem](../classes/ObjectEditSystem.md) deve chamar `setCurrent`/`emitTransform`; os
painéis usam `requestSelect` e assinam `onChange`/`onTransform`.

## Properties

### current

> **current**: `Object3D`\<`Object3DEventMap`\> \| `null`

Defined in: src/editor/EditorSelection.ts:19

Objeto atualmente selecionado (ou `null`). Escrito pelo ObjectEditSystem.

## Methods

### emitTransform()

> **emitTransform**(): `void`

Defined in: src/editor/EditorSelection.ts:32

Notifica que a transform do selecionado mudou (ex.: drag do gizmo).

#### Returns

`void`

***

### onChange()

> **onChange**(`cb`): () => `void`

Defined in: src/editor/EditorSelection.ts:29

Assina mudanças de seleção. Retorna unsubscribe.

#### Parameters

##### cb

(`obj`) => `void`

#### Returns

() => `void`

***

### onSelectRequest()

> **onSelectRequest**(`cb`): () => `void`

Defined in: src/editor/EditorSelection.ts:24

Assina pedidos de seleção (o ObjectEditSystem usa). Retorna unsubscribe.

#### Parameters

##### cb

(`obj`) => `void`

#### Returns

() => `void`

***

### onTransform()

> **onTransform**(`cb`): () => `void`

Defined in: src/editor/EditorSelection.ts:34

Assina mudanças de transform do selecionado. Retorna unsubscribe.

#### Parameters

##### cb

(`obj`) => `void`

#### Returns

() => `void`

***

### requestSelect()

> **requestSelect**(`obj`): `void`

Defined in: src/editor/EditorSelection.ts:22

Pede a seleção de um objeto (ou desseleção com `null`). Painel → sistema.

#### Parameters

##### obj

`Object3D`\<`Object3DEventMap`\> \| `null`

#### Returns

`void`

***

### setCurrent()

> **setCurrent**(`obj`): `void`

Defined in: src/editor/EditorSelection.ts:27

Define a seleção efetiva e notifica `onChange`. Sistema → painéis.

#### Parameters

##### obj

`Object3D`\<`Object3DEventMap`\> \| `null`

#### Returns

`void`
