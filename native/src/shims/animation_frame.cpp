#include "animation_frame.h"

#include <vector>

#include "../napi/napi_util.h"

namespace shims {
namespace {

// Cada rAF agendado tem um id (pra o cancelAnimationFrame). O browser devolve
// um número >0; espelhamos isso. Sem id, `game.stop()` (que chama
// cancelAnimationFrame) dava ReferenceError e abortava o teardown de cena.
struct RafEntry {
  double id;
  napi_ref ref;
};

std::vector<RafEntry> g_callbacks;
double g_nextId = 1;

napi_value jsRequestAnimationFrame(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  double id = g_nextId++;
  if (argc >= 1) {
    napi_ref ref = nullptr;
    if (napi_create_reference(env, args[0], 1, &ref) == napi_ok)
      g_callbacks.push_back({id, ref});
  }
  napi_value out = nullptr;
  napi_create_double(env, id, &out);
  return out;
}

napi_value jsCancelAnimationFrame(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  if (argc >= 1) {
    double id = 0;
    if (napi_get_value_double(env, args[0], &id) == napi_ok) {
      for (auto it = g_callbacks.begin(); it != g_callbacks.end(); ++it) {
        if (it->id == id) {
          napi_delete_reference(env, it->ref);
          g_callbacks.erase(it);
          break;
        }
      }
    }
  }
  return njs::undefined(env);
}

void fireCallback(napi_env env, napi_ref ref, napi_value timestamp) {
  napi_value callback = nullptr;
  if (napi_get_reference_value(env, ref, &callback) == napi_ok && callback) {
    njs::callJsLogged(env, callback, 1, &timestamp, "raf");
  }
  napi_delete_reference(env, ref);
}

}  // namespace

void registerAnimationFrame(napi_env env) {
  napi_value global = nullptr;
  napi_get_global(env, &global);
  njs::setMethod(env, global, "requestAnimationFrame",
                 jsRequestAnimationFrame);
  njs::setMethod(env, global, "cancelAnimationFrame", jsCancelAnimationFrame);
}

void runAnimationFrames(napi_env env, double timestampMs) {
  if (g_callbacks.empty()) return;
  std::vector<RafEntry> generation;
  generation.swap(g_callbacks);  // callbacks re-registram pro próximo frame

  napi_handle_scope scope = nullptr;
  napi_open_handle_scope(env, &scope);
  napi_value timestamp = nullptr;
  napi_create_double(env, timestampMs, &timestamp);
  for (const RafEntry& e : generation) fireCallback(env, e.ref, timestamp);
  napi_close_handle_scope(env, scope);
}

}  // namespace shims
