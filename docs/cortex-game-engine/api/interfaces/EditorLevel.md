[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / EditorLevel

# Interface: EditorLevel

Defined in: [src/core/Game.ts:33](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L33)

Uma fase que o Studio pode abrir direto pelo seletor do viewport (ADR-0186).
O jogo declara a lista em [Game.editorLevels](../classes/Game.md#editorlevels).

## Properties

### group?

> `readonly` `optional` **group?**: `string`

Defined in: [src/core/Game.ts:39](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L39)

Agrupador opcional (mundo, capítulo) — vira separador na lista.

***

### id

> `readonly` **id**: `string`

Defined in: [src/core/Game.ts:35](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L35)

Id da fase — vai em `?level=<id>`, então tem que ser o que o jogo entende.

***

### label?

> `readonly` `optional` **label?**: `string`

Defined in: [src/core/Game.ts:37](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L37)

Nome legível. Sem ele, o seletor mostra o `id`.
