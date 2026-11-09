#include "quit.h"

#include <SDL3/SDL.h>

#include <cstdio>

#include "../core/relaunch.h"
#include "../napi/napi_util.h"

namespace shims {
namespace {

// Empurrar o evento (em vez de matar o processo) deixa o frame corrente
// terminar e o loop principal sair pelo caminho normal: teardown do JS
// runtime, GPU, SDL, Steam/GDK — idêntico ao fechar a janela.
void pushQuit() {
  SDL_Event event;
  SDL_zero(event);
  event.type = SDL_EVENT_QUIT;
  SDL_PushEvent(&event);
}

napi_value undefinedValue(napi_env env) {
  napi_value undefined = nullptr;
  napi_get_undefined(env, &undefined);
  return undefined;
}

napi_value jsQuit(napi_env env, napi_callback_info /*info*/) {
  std::printf("[quit] encerramento pedido pelo jogo\n");
  pushQuit();
  return undefinedValue(env);
}

napi_value jsRestart(napi_env env, napi_callback_info /*info*/) {
  // Mesmo caminho do quit; o main relança o exe depois do teardown (SPEC-0717).
  std::printf("[restart] reinício pedido pelo jogo\n");
  core::requestRelaunch();
  pushQuit();
  return undefinedValue(env);
}

}  // namespace

void registerQuit(napi_env env) {
  napi_value global = nullptr;
  napi_get_global(env, &global);
  njs::setMethod(env, global, "__cortexQuit", jsQuit);
  // sem relançamento (console), sem bridge: o jogo vê location sem reload
  if (core::relaunchSupported()) njs::setMethod(env, global, "__cortexRestart", jsRestart);
}

}  // namespace shims
