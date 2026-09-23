[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / EditorLevel

# Interface: EditorLevel

Defined in: [jge-present/src/core/Game.ts:41](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L41)

Uma fase que o Studio pode abrir direto pelo seletor do viewport (ADR-0186).
O jogo declara a lista em [Game.editorLevels](../classes/Game.md#editorlevels).

## Properties

### group?

> `readonly` `optional` **group?**: `string`

Defined in: [jge-present/src/core/Game.ts:47](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L47)

Agrupador opcional (mundo, capítulo) — vira separador na lista.

***

### id

> `readonly` **id**: `string`

Defined in: [jge-present/src/core/Game.ts:43](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L43)

Id da fase — vai em `?level=<id>`, então tem que ser o que o jogo entende.

***

### label?

> `readonly` `optional` **label?**: `string`

Defined in: [jge-present/src/core/Game.ts:45](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L45)

Nome legível. Sem ele, o seletor mostra o `id`.
