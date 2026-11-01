// Ponte do DecompressionStream (ADR-0650 / SPEC-0651):
// __cortexInflate(bytes, formato) → ArrayBuffer | null. O stream em si é JS
// (js/src/shims/streams.js); o inflate puro mora em inflate.*.
#pragma once

#include <node_api.h>

namespace shims {

void registerDecompression(napi_env env);

}  // namespace shims
