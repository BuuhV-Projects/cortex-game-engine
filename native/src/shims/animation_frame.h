// Shim de requestAnimationFrame: o host dispara uma geração de callbacks por
// frame do loop nativo (o JS re-registra a cada frame, como no browser).
#pragma once

#include <hermes/hermes_api.h>

namespace shims {

// Registra requestAnimationFrame no global.
void registerAnimationFrame(napi_env env);

// Dispara os callbacks registrados (uma geração) com o timestamp em ms.
void runAnimationFrames(napi_env env, double timestampMs);

}  // namespace shims
