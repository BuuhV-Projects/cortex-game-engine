[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / registerEditorAttacher

# Function: registerEditorAttacher()

> **registerEditorAttacher**(`attacher`): `void`

Defined in: [src/core/Game.ts:41](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L41)

Registra a implementação do editor a ser ligada automaticamente em todo
[Game](../classes/Game.md). **Chamado só pelo bundle de desenvolvimento do engine**
(`index.dev.js`); no bundle de produção (`index.js`) ninguém registra, então o
editor simplesmente não existe (zero peso). Ver ADR-0042.

## Parameters

### attacher

[`EditorAttacher`](../type-aliases/EditorAttacher.md)

## Returns

`void`
