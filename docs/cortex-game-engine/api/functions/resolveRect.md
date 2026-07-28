[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / resolveRect

# Function: resolveRect()

> **resolveRect**(`anchor`, `offsetX`, `offsetY`, `width`, `height`, `viewport`): [`UiRect`](../interfaces/UiRect.md)

Defined in: [.claude/worktrees/feat-input-rebind/src/ui/runtime/layout.ts:90](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/layout.ts#L90)

Resolve a posição final (canto superior-esquerdo, px) de um widget:
ponto da âncora no viewport − pivô (mesma fração) no tamanho + offset.

## Parameters

### anchor

[`UiAnchor`](../type-aliases/UiAnchor.md)

### offsetX

`number`

### offsetY

`number`

### width

`number`

### height

`number`

### viewport

[`UiViewport`](../interfaces/UiViewport.md)

## Returns

[`UiRect`](../interfaces/UiRect.md)
