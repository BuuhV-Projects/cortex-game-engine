[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / designViewport

# Function: designViewport()

> **designViewport**(`viewport`, `scale`): [`UiViewport`](../interfaces/UiViewport.md)

Defined in: [src/ui/runtime/layout.ts:74](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/ui/runtime/layout.ts#L74)

Viewport de DESIGN (espaço lógico onde o layout é resolvido): o viewport real
dividido pela [uiScale](uiScale.md). O backend depois estica esse espaço até o
viewport real, escalando posições, tamanhos e fontes de uma vez só.

## Parameters

### viewport

[`UiViewport`](../interfaces/UiViewport.md)

### scale

`number`

## Returns

[`UiViewport`](../interfaces/UiViewport.md)
