#include "quit.h"

#include <SDL3/SDL.h>

#include <cstdio>

#include "../napi/napi_util.h"

namespace shims {
namespace {

napi_value jsQuit(napi_env env, napi_callback_info /*info*/) {
  // Empurrar o evento (em vez de matar o processo) deixa o frame corrente
  // terminar e o loop principal sair pelo caminho normal: teardown do JS
  // runtime, GPU, SDL, Steam/GDK — idêntico ao fechar a janela.
  std::printf("[quit] encerramento pedido pelo jogo\n");
  SDL_Event event;
  SDL_zero(event);
  event.type = SDL_EVENT_QUIT;
  SDL_PushEvent(&event);
  napi_value undefined = nullptr;
  napi_get_undefined(env, &undefined);
  return undefined;
}

}  // namespace

void registerQuit(napi_env env) {
  napi_value global = nullptr;
  napi_get_global(env, &global);
  njs::setMethod(env, global, "__cortexQuit", jsQuit);
}

}  // namespace shims
