// Ponte do recorte alfa do passe de sombra nativo (SPEC-0642).
#pragma once

#include <node_api.h>

struct HostGpu;

namespace shims {

/**
 * Registra `__cortexShadowAlphaClip` no global:
 *
 * - `set(no, textura, bufferUv, passoUv, deslocamentoUv, alphaTest, wrapS, wrapT, uvMatrix)`
 *   → `boolean` — guarda o recorte do nó do espelho; `false` = não guardou (o gate recusa).
 * - `erase(no)` — esquece o recorte (o handle sumiu no `three`).
 */
void registerShadowAlphaClip(napi_env env, HostGpu* gpu);

}  // namespace shims
