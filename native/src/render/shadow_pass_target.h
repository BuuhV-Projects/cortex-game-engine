// O pass depth-only no alvo da cascata (SPEC-0245; limpeza da SPEC-0690).
//
// Separado do `shadow_pass.cpp` para o mesmo pass servir aos dois usos: o
// desenho dos casters e a LIMPEZA da cascata vazia (SPEC-0690, item 3). Os dois
// abrem o alvo com `loadOp = clear`; a limpeza só não tem draws.
#pragma once

#include <cstdint>

#include <webgpu/webgpu.h>

struct HostGpu;

namespace render {

/** Os três objetos de um pass aberto, liberados juntos em {@link submitShadowDepthPass}. */
struct ShadowDepthPass {
  WGPUTextureView view = nullptr;
  WGPUCommandEncoder encoder = nullptr;
  WGPURenderPassEncoder pass = nullptr;
};

/**
 * Abre um pass depth-only em `alvo`, limpando-o com a profundidade 1.
 *
 * A view é criada por chamada, de propósito: a textura é recriada quando o
 * `mapSize` muda, e uma view cacheada apontaria para o recurso morto.
 * Devolve `false` sem nada aberto (nada a liberar) quando a view não sai.
 */
bool openShadowDepthPass(HostGpu* gpu, WGPUTexture alvo, ShadowDepthPass& out);

/** Fecha o pass, submete e libera tudo. */
void submitShadowDepthPass(HostGpu* gpu, ShadowDepthPass& aberto);

/** Pass sem draws: só limpa o alvo (cascata vazia, SPEC-0690). */
bool clearShadowDepthTarget(HostGpu* gpu, WGPUTexture alvo);

/** Relato de `CORTEX_SHADOW_PASS_LOG=1` (ver shadow_pass.h), com o status da SPEC-0690. */
void logShadowPass(WGPUTexture alvo, uint32_t itens, uint32_t desenhados, int status);

}  // namespace render
