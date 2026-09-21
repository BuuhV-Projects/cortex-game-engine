// Ver dual_pass_spike_shim.cpp (SPEC-0241, passo 0) — TEMPORARIO.
#pragma once

#include <node_api.h>

struct HostGpu;

namespace shims {

/** Registra `__cortexDualPassSpike` no global. */
void registerDualPassSpike(napi_env env, HostGpu* gpu);

}  // namespace shims
