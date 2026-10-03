// Transcode KTX2/Basis no host (ADR-0108, BC7 SPEC-0155) — espelha o
// image_decode (que faz o mesmo pra PNG via stb). Dois bindings, mesmo resultado
// `{ width, height, format:'bc7', levels: ArrayBuffer[] }` |
// `{ width, height, format:'rgba', rgba: ArrayBuffer }`:
//   __cortexTranscodeKtx2(bytes)      → resultado | null   (síncrono, thread JS)
//   __cortexTranscodeKtx2Async(bytes) → Promise<resultado> (worker do io_pool,
//                                       reject se falhar — SPEC-0287)
// O transcode puro mora em ktx2_transcode.{h,cpp}.
#pragma once

#include <node_api.h>

namespace shims {

void registerKtx2(napi_env env);

}  // namespace shims
