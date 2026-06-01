[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / EditorState

# Interface: EditorState

Defined in: [src/editor/EditorState.ts:7](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/editor/EditorState.ts#L7)

Estado compartilhado do modo editor — usado pelos sistemas pra saber se devem
ceder o controle (input, câmera, física) ao editor. É uma referência mutável
(objeto) pra que mudanças em runtime sejam vistas por todos os sistemas que
receberam a mesma instância (ex.: passe `pauseWhen: () => editorState.active`).

## Properties

### active

> **active**: `boolean`

Defined in: [src/editor/EditorState.ts:8](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/editor/EditorState.ts#L8)

***

### gizmoDragging

> **gizmoDragging**: `boolean`

Defined in: [src/editor/EditorState.ts:10](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/editor/EditorState.ts#L10)

`true` enquanto o usuário arrasta o gizmo de transformação.
