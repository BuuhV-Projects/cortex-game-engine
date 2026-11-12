#include "underwater.h"

#include <chrono>

#include "../napi/napi_util.h"

namespace webgpu {
namespace {

UnderwaterState g_state;
// Relógio da onda: segundos desde o registro. A fase é contada aqui para o JS não
// atravessar a ponte a cada quadro só para avançar o tempo.
const auto g_start = std::chrono::steady_clock::now();

float named(napi_env env, napi_value obj, const char* name, float fallback) {
  return static_cast<float>(njs::getNamedNumber(env, obj, name, fallback));
}

/** `__cortexUnderwater(params | null)` — ver o contrato no underwater.h. */
napi_value jsUnderwater(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1] = {nullptr};
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  napi_valuetype type = napi_undefined;
  if (argc >= 1 && argv[0]) napi_typeof(env, argv[0], &type);
  if (type != napi_object) {
    g_state = UnderwaterState{};
    return njs::undefined(env);
  }
  UnderwaterState s;
  s.amount = named(env, argv[0], "amount", 0.0f);
  s.tint = named(env, argv[0], "tint", 0.0f);
  s.brightness = named(env, argv[0], "brightness", 1.0f);
  s.amplitude = named(env, argv[0], "amplitude", 0.0f);
  s.frequency = named(env, argv[0], "frequency", 0.0f);
  s.speed = named(env, argv[0], "speed", 0.0f);
  s.r = named(env, argv[0], "r", 0.0f);
  s.g = named(env, argv[0], "g", 0.0f);
  s.b = named(env, argv[0], "b", 0.0f);
  g_state = sanitizeUnderwater(s);
  return njs::undefined(env);
}

}  // namespace

const UnderwaterState& underwaterState() { return g_state; }

UnderwaterUniform underwaterUniformNow() {
  const std::chrono::duration<double> elapsed = std::chrono::steady_clock::now() - g_start;
  return packUnderwater(g_state, elapsed.count());
}

void registerUnderwater(napi_env env) {
  napi_value global = nullptr;
  napi_get_global(env, &global);
  njs::setMethod(env, global, "__cortexUnderwater", jsUnderwater);
}

}  // namespace webgpu
