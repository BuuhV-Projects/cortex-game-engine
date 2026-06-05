[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / EditorOutliner

# Interface: EditorOutliner

Defined in: src/editor/EditorOutliner.ts:5

Painel de hierarquia do editor (lista os objetos da cena).

## Properties

### root

> **root**: `HTMLDivElement`

Defined in: src/editor/EditorOutliner.ts:7

Elemento raiz (já anexado ao parent).

## Methods

### refresh()

> **refresh**(): `void`

Defined in: src/editor/EditorOutliner.ts:11

Reconstrói a lista a partir dos `editRoots` (chame ao abrir o editor / quando a cena mudar).

#### Returns

`void`

***

### setVisible()

> **setVisible**(`v`): `void`

Defined in: src/editor/EditorOutliner.ts:9

Mostra/esconde o painel (tipicamente atrelado ao editor ON/OFF).

#### Parameters

##### v

`boolean`

#### Returns

`void`
