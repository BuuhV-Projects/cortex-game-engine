// Ponte do lote de desenhos diretos (SPEC-0333, b.2 do ADR-0330).
//
// Expõe `__cortexDrawBatch`:
//   record(pipeline, grupos[], vertexBuffers[], indexBuffer|null, indice32) → id
//   release(id)
//   flush(passEncoder, comandos: Int32Array, quantos) → desenhos emitidos
// Os handles são os objetos JS que o próprio host criou (o `three` os recebeu
// de `device.create*`); a receita segura uma referência wgpu própria
// (`AddRef`), então o GC do JS não a invalida.
#pragma once

#include <node_api.h>

namespace shims {

void registerDrawBatch(napi_env env);

}  // namespace shims
