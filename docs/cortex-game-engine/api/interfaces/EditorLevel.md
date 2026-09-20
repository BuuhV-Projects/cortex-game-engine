[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / EditorLevel

# Interface: EditorLevel

Defined in: [.claude/worktrees/perf-boot-nativo/src/core/Game.ts:22](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L22)

Uma fase que o Studio pode abrir direto pelo seletor do viewport (ADR-0186).
O jogo declara a lista em [Game.editorLevels](../classes/Game.md#editorlevels).

## Properties

### group?

> `readonly` `optional` **group?**: `string`

Defined in: [.claude/worktrees/perf-boot-nativo/src/core/Game.ts:28](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L28)

Agrupador opcional (mundo, capítulo) — vira separador na lista.

***

### id

> `readonly` **id**: `string`

Defined in: [.claude/worktrees/perf-boot-nativo/src/core/Game.ts:24](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L24)

Id da fase — vai em `?level=<id>`, então tem que ser o que o jogo entende.

***

### label?

> `readonly` `optional` **label?**: `string`

Defined in: [.claude/worktrees/perf-boot-nativo/src/core/Game.ts:26](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/Game.ts#L26)

Nome legível. Sem ele, o seletor mostra o `id`.
