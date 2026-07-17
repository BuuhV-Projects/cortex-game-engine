// Transcode KTX2/Basis → RGBA no host (ADR-0108) — espelha o image_decode
// (que faz o mesmo pra PNG via stb). `__cortexTranscodeKtx2(bytes)` →
// `{ width, height, rgba: ArrayBuffer }` | null. Reusa o upload de textura RGBA
// que já existe (Fase 1: sem formatos de bloco no shim WebGPU).
#pragma once

#include <node_api.h>

namespace shims {

void registerKtx2(napi_env env);

}  // namespace shims
