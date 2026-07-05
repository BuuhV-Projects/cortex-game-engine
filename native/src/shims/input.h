// Shim de input: eventos SDL3 → eventos de browser no JS (keydown/keyup/
// pointerdown via __cortexDispatchInput) e Gamepad API (navigator.
// getGamepads sobre SDL_Gamepad, mapeamento "standard" do W3C).
#pragma once

#include <SDL3/SDL.h>
#include <hermes/hermes_api.h>

namespace shims {

// Registra __cortexInput (getGamepads) no global JS.
void registerInput(napi_env env);

// Processa um evento SDL de input. Retorna true se o evento era de input
// (teclado/mouse/gamepad) e foi tratado.
bool handleSdlInputEvent(napi_env env, const SDL_Event& event);

// Fecha os gamepads abertos (shutdown).
void closeGamepads();

}  // namespace shims
