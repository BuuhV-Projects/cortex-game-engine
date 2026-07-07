[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / runWithLoadingScreen

# Function: runWithLoadingScreen()

> **runWithLoadingScreen**\<`T`\>(`ui`, `task`, `options?`): `Promise`\<`T`\>

Defined in: [src/core/LoadingScreen.ts:133](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/LoadingScreen.ts#L133)

Mostra uma tela de loading e **dirige o loop de render da UI** enquanto
`task` roda, escondendo tudo ao terminar. Resolve o caso clássico do menu
congelado: entre escolher a fase e o `game.start()` NÃO há loop de render, e
o carregamento pesado (GLBs, física, áudio) trava a última imagem. Aqui um
`requestAnimationFrame` desenha a UI (fundo + barra) a cada quadro durante o
carregamento — funciona no Studio e no export nativo (mesma UiLayer).

## Type Parameters

### T

`T`

## Parameters

### ui

[`UiLayer`](../classes/UiLayer.md)

### task

(`progress`) => `Promise`\<`T`\>

### options?

`Omit`\<[`LoadingScreenOptions`](../interfaces/LoadingScreenOptions.md), `"parent"`\> = `{}`

## Returns

`Promise`\<`T`\>

## Example

```ts
const scene = await runWithLoadingScreen(game.ui, async (progress) => {
  progress('Carregando cena…', 0.3);
  const s = await buildScene(...);
  progress('Áudio…', 0.8);
  await setupAudio(game);
  return s;
});
game.start();
```
