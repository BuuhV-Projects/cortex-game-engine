[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / createLoadingScreen

# Function: createLoadingScreen()

> **createLoadingScreen**(`ui`, `options?`): [`LoadingScreen`](../interfaces/LoadingScreen.md)

Defined in: [src/core/LoadingScreen.ts:37](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/LoadingScreen.ts#L37)

Loading sobre a **UI de runtime** (ADR-0102) — mesma tela nos dois
backends (Studio/DOM e host/renderer).

## Parameters

### ui

[`UiLayer`](../classes/UiLayer.md)

### options?

`Omit`\<[`LoadingScreenOptions`](../interfaces/LoadingScreenOptions.md), `"parent"`\> = `{}`

## Returns

[`LoadingScreen`](../interfaces/LoadingScreen.md)

## Example

```ts
const loading = createLoadingScreen(game.ui);
loading.show();
loading.setProgress('Carregando fase…', 0.4);
loading.hide();
```
