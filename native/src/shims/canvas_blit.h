// __cortexBlitImage (ADR-0318): o laço do drawImage do canvas 2D em C++
// (canvas2d/blit.h), chamado pelo bitmap.js do shim.
#pragma once

#include <node_api.h>

namespace shims {

void registerCanvasBlit(napi_env env);

}  // namespace shims
