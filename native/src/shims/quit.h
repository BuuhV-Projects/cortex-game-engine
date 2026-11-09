// Encerramento pedido pelo JOGO (SPEC-0120): __cortexQuit() empurra um
// SDL_EVENT_QUIT na fila — o loop principal encerra pelo MESMO caminho do
// fechar-janela/Alt+F4 (teardown único). O shim de DOM (dom-lite.js) mapeia
// window.close() pra cá, mantendo a API do browser no código do jogo.
// __cortexRestart() (SPEC-0717) faz o mesmo e marca o relançamento do exe no
// fim do main; só é registrado onde o host sabe relançar (PC Windows sem GDK),
// e o globals.js mapeia location.reload() pra ele.
#pragma once

#include <node_api.h>

namespace shims {

void registerQuit(napi_env env);

}  // namespace shims
