#include "window_control.h"

#include "../napi/napi_util.h"

namespace shims {
namespace {

// A janela que o shim controla (a do host; uma só por processo).
SDL_Window* g_window = nullptr;

// Piso de tamanho: um painel colapsado manda 0×0, e uma surface 0×0 não é
// configurável — o host já trata (pula o frame), mas não deixamos a janela
// chegar lá.
constexpr int kMinSide = 1;

napi_value jsSetBounds(napi_env env, napi_callback_info info) {
  size_t argc = 4;
  napi_value argv[4] = {nullptr, nullptr, nullptr, nullptr};
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  if (!g_window || argc < 4) return nullptr;
  int32_t x = 0, y = 0, w = 0, h = 0;
  napi_get_value_int32(env, argv[0], &x);
  napi_get_value_int32(env, argv[1], &y);
  napi_get_value_int32(env, argv[2], &w);
  napi_get_value_int32(env, argv[3], &h);
  if (w < kMinSide || h < kMinSide) return nullptr;
  // Posição é relativa ao PAI quando a janela é filha (WS_CHILD) — é o
  // retângulo do painel dentro da janela do Studio.
  SDL_SetWindowPosition(g_window, x, y);
  SDL_SetWindowSize(g_window, w, h);
  return nullptr;
}

}  // namespace

void registerWindowControl(napi_env env, SDL_Window* window) {
  const char* parent = SDL_getenv("CORTEX_PARENT_HWND");
  if (parent == nullptr || parent[0] == '\0') return;  // só no modo embutido
  g_window = window;
  napi_value global = nullptr;
  napi_get_global(env, &global);
  njs::setMethod(env, global, "__cortexSetWindowBounds", jsSetBounds);
}

}  // namespace shims
