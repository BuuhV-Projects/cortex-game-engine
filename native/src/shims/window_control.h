// Controle da janela pelo JS (SPEC-0201 / M2 do PRD-0007):
// __cortexSetWindowBounds(x, y, w, h) → move/redimensiona a janela do host.
//
// Existe para o preview embutido: o Studio manda a geometria do painel pelo
// canal da IDE (SPEC-0200) e o HOST se posiciona sozinho — assim a IDE não
// precisa de FFI nem de addon nativo para chamar SetWindowPos.
//
// Registrado apenas quando o host roda embutido (`CORTEX_PARENT_HWND`): um jogo
// standalone não deve deixar o conteúdo mexer na própria janela.
#pragma once

#include <SDL3/SDL.h>
#include <node_api.h>

namespace shims {

// Registra __cortexSetWindowBounds no global. No-op sem `CORTEX_PARENT_HWND`.
void registerWindowControl(napi_env env, SDL_Window* window);

}  // namespace shims
