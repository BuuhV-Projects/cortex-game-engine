[**cortex-game-engine**](../README.md)

***

[cortex-game-engine](../README.md) / runWithLoadingScreen

# Function: runWithLoadingScreen()

> **runWithLoadingScreen**\<`T`\>(`ui`, `task`, `options?`): `Promise`\<`T`\>

Defined in: [src/core/LoadingScreen.ts:143](https://github.com/BuuhV-Projects/cortex-game-engine/blob/main/src/core/LoadingScreen.ts#L143)

Mostra uma tela de loading e **dirige o loop de render da UI** enquanto
`task` roda, escondendo tudo ao terminar. Resolve o caso clássico do menu
congelado: entre escolher a fase e o `game.start()` NÃO há loop de render, e
o carregamento pesado (GLBs, física, áudio) trava a última imagem. Aqui um
`requestAnimationFrame` desenha a UI (fundo + barra) a cada quadro durante o
carregamento — funciona no Studio e no export nativo (mesma UiLayer).

A tela é **pré-pintada e apresentada (2 quadros) ANTES da task** (SPEC-0154):
no host nativo a carga roda numa única virada de JS (fetch síncrono) e o rAF
não dispara no meio — o que fica na tela durante a carga é o último frame
apresentado antes dela, então ele TEM de ser o loading (e imagem de fundo,
se houver, precisa do 2º quadro pra estar aplicada).

**`await`e cada `progress(...)`** pra barra avançar por etapa também no
export (a promise resolve no rAF seguinte = present do quadro). Ignorar o
retorno funciona, mas no host a barra fica no estado da última apresentação.

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
  await progress('Carregando cena…', 0.3);
  const s = await buildScene(...);
  await progress('Áudio…', 0.8);
  await setupAudio(game);
  return s;
});
game.start();
```
