# 0120 - Encerramento pedido pelo jogo: window.close() → __cortexQuit

**Data:** 2026-07-17
**Status:** aceito

## Contexto

O botão "Sair" do menu do teste4 chamava `window.close()` — que no export
CortexNative **não existia**: o dom-lite instalava `window = globalThis` sem
`close`, então o clique lançava `TypeError` (engolido no drain de microtasks)
e **matava o loop do menu** em vez de fechar o programa. Não havia NENHUM
caminho pra o jogo pedir encerramento ao host: as bridges existentes
(`__cortexRasterText`, `__cortexUiLayer`, …) são todas de render/IO.

Num export fullscreen estilo console (sem barra de título) e no Xbox (M3),
"sair pelo jogo" é o caminho primário de encerramento — precisa funcionar.

## Decisão

1. **Host** (`native/src/shims/quit.*`): binding global `__cortexQuit()` que
   **empurra `SDL_EVENT_QUIT` na fila do SDL** (`SDL_PushEvent`) em vez de
   matar o processo. O loop principal encerra pelo MESMO caminho do
   fechar-janela/Alt+F4: frame corrente termina, teardown único (JS runtime →
   GPU → SDL → Steam/GDK). Registrado no `main.cpp` como os demais shims.
2. **Shim JS** (`dom-lite.js`): `window.close()` passa a existir e chama
   `__cortexQuit` quando a bridge está presente; sem ela (bundle fora do
   host), é no-op — o mesmo comportamento de uma aba normal de browser.

O código do JOGO continua usando a API do browser (`window.close()`), fiel à
regra nº 2 do native/ (o JS não sabe que está no host). Nenhuma mudança no
engine nem nos jogos; basta re-exportar com o host novo.

## Consequências

- "Sair" nos exports nativos fecha o programa de verdade (validado por smoke:
  `boot.js` chamando `__cortexQuit` → `cortex-native encerrou`, exit 0).
- Encerramento é **assíncrono** (evento na fila): o JS que chamou `close()`
  ainda roda até o fim do frame — código após o `close()` deve tolerar isso
  (o menu do teste4 já tolera: volta pro título enquanto o host fecha).
- No browser/Studio o "Sair" segue no-op (limitação do browser, não nossa);
  jogos podem esconder o botão fora do host se quiserem.
- Regressão travada em `tests/native/dom-lite-close.test.ts`.
