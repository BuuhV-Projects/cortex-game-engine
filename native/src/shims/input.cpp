#include "input.h"

#include <string>
#include <vector>

#include "../napi/napi_util.h"

namespace shims {
namespace {

std::vector<SDL_Gamepad*> g_gamepads;

// ── teclado: SDL → nomes da API de browser (key/code) ──────────────────────

std::string browserKeyName(const SDL_KeyboardEvent& key) {
  switch (key.key) {
    case SDLK_UP: return "ArrowUp";
    case SDLK_DOWN: return "ArrowDown";
    case SDLK_LEFT: return "ArrowLeft";
    case SDLK_RIGHT: return "ArrowRight";
    case SDLK_RETURN: return "Enter";
    case SDLK_ESCAPE: return "Escape";
    case SDLK_SPACE: return " ";
    case SDLK_TAB: return "Tab";
    case SDLK_BACKSPACE: return "Backspace";
    case SDLK_LSHIFT:
    case SDLK_RSHIFT: return "Shift";
    default: {
      const char* name = SDL_GetKeyName(key.key);
      std::string out = name ? name : "";
      // Browser: letras minúsculas em `key` (sem shift). SDL dá "A".
      if (out.size() == 1 && out[0] >= 'A' && out[0] <= 'Z')
        out[0] = static_cast<char>(out[0] - 'A' + 'a');
      return out;
    }
  }
}

std::string browserCodeName(const SDL_KeyboardEvent& key) {
  switch (key.key) {
    case SDLK_UP: return "ArrowUp";
    case SDLK_DOWN: return "ArrowDown";
    case SDLK_LEFT: return "ArrowLeft";
    case SDLK_RIGHT: return "ArrowRight";
    case SDLK_RETURN: return "Enter";
    case SDLK_ESCAPE: return "Escape";
    case SDLK_SPACE: return "Space";
    default: {
      const char* name = SDL_GetKeyName(key.key);
      std::string base = name ? name : "";
      if (base.size() == 1 && base[0] >= 'A' && base[0] <= 'Z')
        return "Key" + base;
      if (base.size() == 1 && base[0] >= '0' && base[0] <= '9')
        return "Digit" + base;
      return base;
    }
  }
}

void setString(napi_env env, napi_value obj, const char* name,
               const std::string& value) {
  napi_value v = nullptr;
  napi_create_string_utf8(env, value.c_str(), NAPI_AUTO_LENGTH, &v);
  napi_set_named_property(env, obj, name, v);
}

void setNumber(napi_env env, napi_value obj, const char* name, double value) {
  napi_value v = nullptr;
  napi_create_double(env, value, &v);
  napi_set_named_property(env, obj, name, v);
}

void setBool(napi_env env, napi_value obj, const char* name, bool value) {
  napi_value v = nullptr;
  napi_get_boolean(env, value, &v);
  napi_set_named_property(env, obj, name, v);
}

// Entrega o evento pro JS via globalThis.__cortexDispatchInput (instalado
// pelo prelude — ele redistribui pra window/document/body).
void dispatchToJs(napi_env env, napi_value eventObj) {
  napi_value global = nullptr;
  napi_get_global(env, &global);
  napi_value dispatch = nullptr;
  if (!njs::getNamed(env, global, "__cortexDispatchInput", &dispatch)) return;
  njs::callJsLogged(env, dispatch, 1, &eventObj, "input");
}

void dispatchKeyEvent(napi_env env, const SDL_KeyboardEvent& key, bool down) {
  napi_handle_scope scope = nullptr;
  napi_open_handle_scope(env, &scope);
  napi_value event = njs::makeObject(env);
  setString(env, event, "type", down ? "keydown" : "keyup");
  setString(env, event, "key", browserKeyName(key));
  setString(env, event, "code", browserCodeName(key));
  setBool(env, event, "repeat", key.repeat);
  dispatchToJs(env, event);
  napi_close_handle_scope(env, scope);
}

void dispatchPointerEvent(napi_env env, const char* type,
                          const SDL_MouseButtonEvent& button) {
  napi_handle_scope scope = nullptr;
  napi_open_handle_scope(env, &scope);
  napi_value event = njs::makeObject(env);
  setString(env, event, "type", type);
  setNumber(env, event, "clientX", button.x);
  setNumber(env, event, "clientY", button.y);
  setNumber(env, event, "button", button.button - 1);
  dispatchToJs(env, event);
  napi_close_handle_scope(env, scope);
}

// ── gamepads: SDL_Gamepad → snapshot no layout "standard" do W3C ───────────

void openGamepad(SDL_JoystickID id) {
  if (SDL_Gamepad* pad = SDL_OpenGamepad(id)) g_gamepads.push_back(pad);
}

void closeGamepad(SDL_JoystickID id) {
  for (auto it = g_gamepads.begin(); it != g_gamepads.end(); ++it) {
    if (SDL_GetGamepadID(*it) == id) {
      SDL_CloseGamepad(*it);
      g_gamepads.erase(it);
      return;
    }
  }
}

void pushButton(napi_env env, napi_value buttons, uint32_t index,
                bool pressed, double value) {
  napi_value button = njs::makeObject(env);
  setBool(env, button, "pressed", pressed);
  setBool(env, button, "touched", pressed);
  setNumber(env, button, "value", value);
  napi_set_element(env, buttons, index, button);
}

double axisValue(SDL_Gamepad* pad, SDL_GamepadAxis axis) {
  return SDL_GetGamepadAxis(pad, axis) / 32767.0;
}

napi_value makeGamepadSnapshot(napi_env env, SDL_Gamepad* pad,
                               uint32_t index) {
  napi_value out = njs::makeObject(env);
  const char* name = SDL_GetGamepadName(pad);
  setString(env, out, "id", name ? name : "gamepad");
  setNumber(env, out, "index", index);
  setBool(env, out, "connected", true);
  setString(env, out, "mapping", "standard");

  // Ordem "standard" do W3C: A B X Y LB RB LT RT Back Start LS RS dpad(4)
  napi_value buttons = nullptr;
  napi_create_array(env, &buttons);
  const SDL_GamepadButton order[] = {
      SDL_GAMEPAD_BUTTON_SOUTH, SDL_GAMEPAD_BUTTON_EAST,
      SDL_GAMEPAD_BUTTON_WEST, SDL_GAMEPAD_BUTTON_NORTH,
      SDL_GAMEPAD_BUTTON_LEFT_SHOULDER, SDL_GAMEPAD_BUTTON_RIGHT_SHOULDER,
  };
  uint32_t i = 0;
  for (SDL_GamepadButton b : order) {
    bool pressed = SDL_GetGamepadButton(pad, b);
    pushButton(env, buttons, i++, pressed, pressed ? 1.0 : 0.0);
  }
  double lt = axisValue(pad, SDL_GAMEPAD_AXIS_LEFT_TRIGGER);
  double rt = axisValue(pad, SDL_GAMEPAD_AXIS_RIGHT_TRIGGER);
  pushButton(env, buttons, i++, lt > 0.5, lt);
  pushButton(env, buttons, i++, rt > 0.5, rt);
  const SDL_GamepadButton tail[] = {
      SDL_GAMEPAD_BUTTON_BACK, SDL_GAMEPAD_BUTTON_START,
      SDL_GAMEPAD_BUTTON_LEFT_STICK, SDL_GAMEPAD_BUTTON_RIGHT_STICK,
      SDL_GAMEPAD_BUTTON_DPAD_UP, SDL_GAMEPAD_BUTTON_DPAD_DOWN,
      SDL_GAMEPAD_BUTTON_DPAD_LEFT, SDL_GAMEPAD_BUTTON_DPAD_RIGHT,
      SDL_GAMEPAD_BUTTON_GUIDE,
  };
  for (SDL_GamepadButton b : tail) {
    bool pressed = SDL_GetGamepadButton(pad, b);
    pushButton(env, buttons, i++, pressed, pressed ? 1.0 : 0.0);
  }
  napi_set_named_property(env, out, "buttons", buttons);

  napi_value axes = nullptr;
  napi_create_array(env, &axes);
  const SDL_GamepadAxis axisOrder[] = {
      SDL_GAMEPAD_AXIS_LEFTX, SDL_GAMEPAD_AXIS_LEFTY,
      SDL_GAMEPAD_AXIS_RIGHTX, SDL_GAMEPAD_AXIS_RIGHTY,
  };
  for (uint32_t a = 0; a < 4; ++a) {
    napi_value v = nullptr;
    napi_create_double(env, axisValue(pad, axisOrder[a]), &v);
    napi_set_element(env, axes, a, v);
  }
  napi_set_named_property(env, out, "axes", axes);
  return out;
}

napi_value jsGetGamepads(napi_env env, napi_callback_info) {
  napi_value out = nullptr;
  napi_create_array(env, &out);
  // Gate de FOCO (paridade com o browser): sem foco de teclado na janela, o
  // controle não é lido — senão o MESMO controle físico ecoa em toda instância
  // aberta (o export em segundo plano andava sozinho enquanto o dev usava o
  // Studio, e vice-versa).
  SDL_Window* focused = SDL_GetKeyboardFocus();
  if (!focused) return out;  // lista vazia = nenhum pad (padrão do browser)
  for (uint32_t i = 0; i < g_gamepads.size(); ++i) {
    napi_set_element(env, out, i, makeGamepadSnapshot(env, g_gamepads[i], i));
  }
  return out;
}

}  // namespace

void registerInput(napi_env env) {
  napi_value global = nullptr;
  napi_get_global(env, &global);
  napi_value input = njs::makeObject(env);
  njs::setMethod(env, input, "getGamepads", jsGetGamepads);
  napi_set_named_property(env, global, "__cortexInput", input);
}

bool handleSdlInputEvent(napi_env env, const SDL_Event& event) {
  switch (event.type) {
    case SDL_EVENT_KEY_DOWN:
      dispatchKeyEvent(env, event.key, true);
      return true;
    case SDL_EVENT_KEY_UP:
      dispatchKeyEvent(env, event.key, false);
      return true;
    case SDL_EVENT_MOUSE_BUTTON_DOWN:
      dispatchPointerEvent(env, "pointerdown", event.button);
      return true;
    case SDL_EVENT_MOUSE_BUTTON_UP:
      dispatchPointerEvent(env, "pointerup", event.button);
      return true;
    case SDL_EVENT_GAMEPAD_ADDED:
      openGamepad(event.gdevice.which);
      return true;
    case SDL_EVENT_GAMEPAD_REMOVED:
      closeGamepad(event.gdevice.which);
      return true;
    default:
      return false;
  }
}

void closeGamepads() {
  for (SDL_Gamepad* pad : g_gamepads) SDL_CloseGamepad(pad);
  g_gamepads.clear();
}

}  // namespace shims
