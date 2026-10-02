// Shim de input: eventos SDL3 → eventos de browser no JS (keydown/keyup/
// pointerdown via __cortexDispatchInput) e Gamepad API (navigator.
// getGamepads sobre SDL_Gamepad, mapeamento "standard" do W3C).
#pragma once

#include <SDL3/SDL.h>
#include <node_api.h>

namespace shims {

// Registra __cortexInput (getGamepads, setPointerLock) no global JS. A janela
// é a que entra/sai do modo relativo do mouse (pointer lock, SPEC-0285).
void registerInput(napi_env env, SDL_Window* window);

// Processa um evento SDL de input. Retorna true se o evento era de input
// (teclado/mouse/gamepad) e foi tratado.
bool handleSdlInputEvent(napi_env env, const SDL_Event& event);

// Fecha os gamepads abertos (shutdown).
void closeGamepads();

}  // namespace shims
