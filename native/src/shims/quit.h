// Encerramento pedido pelo JOGO (ADR-0120): __cortexQuit() empurra um
// SDL_EVENT_QUIT na fila — o loop principal encerra pelo MESMO caminho do
// fechar-janela/Alt+F4 (teardown único). O shim de DOM (dom-lite.js) mapeia
// window.close() pra cá, mantendo a API do browser no código do jogo.
#pragma once

#include <hermes/hermes_api.h>

namespace shims {

void registerQuit(napi_env env);

}  // namespace shims
