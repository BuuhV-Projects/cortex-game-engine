// API pública do módulo webgpu/ — o shim `navigator.gpu` + `gpuContext`.
// Subset do M0 (render pass com pipeline); cresce marco a marco até cobrir
// o que o Three.js WebGPURenderer usa. Ver docs/cortex-native/architecture.md.
#pragma once

#include <node_api.h>

#include "../core/host_gpu.h"

namespace webgpu {

// Registra navigator.gpu e gpuContext no global JS.
void registerBindings(napi_env env, HostGpu* gpu);

// Apresenta o frame se o JS adquiriu textura da surface neste frame.
void presentIfAcquired(HostGpu* gpu);

// Hook de fim de frame das destruições de buffers/texturas (hoje NO-OP —
// destroy() é release-only, ver internal.h). Chamado 1× por frame após o
// present; fica pra reativar destruição agressiva no futuro.
void flushDeferredDestroys();

}  // namespace webgpu
