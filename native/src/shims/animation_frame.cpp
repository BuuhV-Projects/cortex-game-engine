#include "animation_frame.h"

#include <vector>

#include "../napi/napi_util.h"

namespace shims {
namespace {

std::vector<napi_ref> g_callbacks;

napi_value jsRequestAnimationFrame(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  if (argc >= 1) {
    napi_ref ref = nullptr;
    if (napi_create_reference(env, args[0], 1, &ref) == napi_ok)
      g_callbacks.push_back(ref);
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
}

void runAnimationFrames(napi_env env, double timestampMs) {
  if (g_callbacks.empty()) return;
  std::vector<napi_ref> generation;
  generation.swap(g_callbacks);  // callbacks re-registram pro próximo frame

  napi_handle_scope scope = nullptr;
  napi_open_handle_scope(env, &scope);
  napi_value timestamp = nullptr;
  napi_create_double(env, timestampMs, &timestamp);
  for (napi_ref ref : generation) fireCallback(env, ref, timestamp);
  napi_close_handle_scope(env, scope);
}

}  // namespace shims
