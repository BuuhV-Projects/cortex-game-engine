// Ponte do Rapier NATIVO (crate native/rapier-native, C ABI) pro JS:
// registra __rapierNative com métodos achatados; a forma da API
// rapier3d-compat é reconstruída em JS (js/src/shims/rapier-compat.js).
#pragma once

#include <node_api.h>

namespace shims {

void registerRapier(napi_env env);

}  // namespace shims
