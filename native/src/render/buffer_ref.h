// Posse de `WGPUBuffer` emprestado por quem o guarda (ADR-0692, item 5).
//
// O `GeometryRegistry` e a `AlphaClipStore` guardam buffers que outro lado
// criou (o `three` ou o `NativeGeometryStore`). Sem `AddRef`, um buffer
// recriado e coletado pelo GC (o finalizer chama `wgpuBufferRelease`) deixaria
// o registro com um handle solto. Por isso quem guarda faz `AddRef` e solta ao
// sobrescrever, apagar e limpar.
//
// As duas operações entram por ponteiro de função para a política ficar
// testável sem GPU: o harness `cortex_host_tests` não linka o wgpu e conta as
// chamadas com funções falsas. As do wgpu moram em `buffer_ref.cpp`, só no host.
#pragma once

#include <webgpu/webgpu.h>

namespace render {

/** `AddRef`/`Release` de buffer, substituíveis no teste. */
struct BufferRefOps {
  void (*addRef)(WGPUBuffer buffer) = nullptr;
  void (*release)(WGPUBuffer buffer) = nullptr;
};

/** As operações reais (`wgpuBufferAddRef`/`wgpuBufferRelease`). */
const BufferRefOps& wgpuBufferRefOps();

/** `AddRef` de `buffer`, se houver buffer e operação. */
inline void retainBuffer(const BufferRefOps& ops, WGPUBuffer buffer) {
  if (buffer && ops.addRef) ops.addRef(buffer);
}

/** `Release` de `buffer`, se houver buffer e operação. */
inline void releaseBuffer(const BufferRefOps& ops, WGPUBuffer buffer) {
  if (buffer && ops.release) ops.release(buffer);
}

}  // namespace render
