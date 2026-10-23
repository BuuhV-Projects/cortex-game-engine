// __cortexRaycast (ADR-0346 / SPEC-0347): raycast de colisão da câmera e do
// personagem em C++ (physics/raycast/). O engine detecta o global e cai no
// caminho JS quando ele não existe.
#pragma once

#include <node_api.h>

namespace shims {

void registerRaycast(napi_env env);

}  // namespace shims
