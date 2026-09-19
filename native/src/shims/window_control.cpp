#include "window_control.h"

#include <windows.h>

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

// __cortexSetWindowVisible(bool) — esconde/mostra a janela do host.
//
// Existe por causa do AIRSPACE (SPEC-0206): a janela nativa fica sempre por
// cima do DOM, entao o overlay que captura o drag-and-drop de asset nunca
// recebe o drop. Escondendo a janela durante o arraste, o overlay volta a
// funcionar; ao soltar, a janela reaparece.
napi_value jsSetVisible(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1] = {nullptr};
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  if (!g_window || argc < 1) return nullptr;
  bool visible = true;
  napi_get_value_bool(env, argv[0], &visible);
  // Win32 direto, nao SDL_HideWindow: a janela foi ADOTADA por SetParent
  // (WS_CHILD) fora do conhecimento do SDL, e o SDL_HideWindow nao tem efeito
  // nela — medido. O HWND vem das props da propria janela SDL.
  HWND hwnd = static_cast<HWND>(SDL_GetPointerProperty(
      SDL_GetWindowProperties(g_window), SDL_PROP_WINDOW_WIN32_HWND_POINTER, nullptr));
  if (hwnd) ShowWindow(hwnd, visible ? SW_SHOWNOACTIVATE : SW_HIDE);
  else if (visible) SDL_ShowWindow(g_window);
  else SDL_HideWindow(g_window);
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
  njs::setMethod(env, global, "__cortexSetWindowVisible", jsSetVisible);
}

}  // namespace shims
