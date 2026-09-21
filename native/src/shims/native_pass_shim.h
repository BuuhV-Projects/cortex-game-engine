// Ver native_pass_shim.cpp (SPEC-0241, passo 3).
#pragma once

#include <node_api.h>

struct HostGpu;

namespace shims {

/** Registra `__cortexNativePass` no global. */
void registerNativePass(napi_env env, HostGpu* gpu);

}  // namespace shims
