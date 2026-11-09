# SPEC-0717 - Reinício pedido pelo jogo: location.reload() → __cortexRestart

**Data:** 2026-11-08
**Status:** implementado
**Relacionados:** SPEC-0120 (encerramento pelo jogo, `window.close()` → `__cortexQuit`), ADR-0126/0174 (Steam antes da
janela), regra nº 2 do native/ (API fiel ao browser)

## Contexto

Um jogo que troca o idioma (ou outra opção que só vale do zero, como o renderizador) precisa **reiniciar**. No browser
isso é `location.reload()`. No host nativo o `location` é um objeto inerte (`globals.js`) sem `reload`, e o único caminho
do jogo até o host é o `__cortexQuit` (SPEC-0120): o jogo só conseguia **fechar**, e o jogador tinha de abrir de novo à
mão. O primeiro caso é a troca de idioma do DDD 00 (SPEC-0238 do jogo).

## Decisão

1. **Host** (`native/src/shims/quit.*`): binding global `__cortexRestart()`, irmão do `__cortexQuit`. Ele marca o pedido
   de relançamento (`core::requestRelaunch`) e **empurra `SDL_EVENT_QUIT`**, igual ao quit: o frame corrente termina e o
   teardown é o mesmo do fechar-janela (JS runtime → GPU → janela → SDL → GDK → Steam).
2. **Relançamento** (`native/src/core/relaunch.*`): no fim do `main`, depois de todo o teardown, se houve pedido, o host
   abre **o próprio exe** com a **mesma linha de comando** e a mesma pasta corrente (`CreateProcessW` com
   `GetModuleFileNameW` + `GetCommandLineW`), e só então sai com 0. Depois do teardown porque assim não há duas janelas
   ao mesmo tempo, o processo novo não disputa o dispositivo de áudio ou a GPU com o velho, e a Steam já foi desligada
   (o filho herda o ambiente; o `initSteam` exporta `SteamAppId` logo depois do `RestartAppIfNecessary`, então a variável
   vem junto mesmo quando a Steam não a definiu, como em dev com `steam_appid.txt`, e o filho não relança pela Steam). Se
   o `CreateProcessW` falhar, o host só sai (o mesmo resultado de um quit) e registra o erro no log.
3. **Onde existe**: só no PC Windows sem GDK (`_WIN32 && !CORTEX_GDK`). No console (GDK) um app não abre outra cópia de si
   mesmo: lá o `__cortexRestart` **não é registrado**.
4. **Shim JS** (`globals.js`): `location.reload()` passa a existir **só quando** a bridge `__cortexRestart` existe, e a
   chama. Sem a bridge (console, bundle fora do host) não há `reload`, e o jogo detecta com
   `typeof location.reload === 'function'`, como faria num ambiente que não recarrega. O jogo continua usando a API do
   browser.

## Consequências

- No export para PC, `location.reload()` reinicia o jogo de verdade: fecha a janela e abre de novo em ~1 s, passando pela
  splash como numa abertura normal. Opções salvas (`config.ini`, saves) já estão em disco, porque o jogo grava antes de
  pedir.
- O reinício é **assíncrono** (evento na fila), como o quit: o JS que chamou ainda roda até o fim do frame.
- No console o jogo segue sem `reload`; quem precisa reiniciar fecha (`window.close()`) e avisa o jogador.
- Regressões: `tests/native/globals-reload.test.ts` (o shim JS) e `native/tests/relaunch_test.cpp` (o pedido de
  relançamento).
