// Sonda de profundidade (SPEC-0241, passo 3) — TEMPORÁRIA.
//
// Pinta na cor o que está no buffer de profundidade. Existe porque inferir o
// conteúdo pelo comportamento do teste levou a conclusões erradas duas vezes:
// "a cena ocluiu" e "a diferença é numérica" explicavam os dados tão bem quanto
// "o buffer está zerado", e só lendo dá para separar.
//
// Preto = perto de 0, branco = perto de 1. Um buffer com a cena dentro tem
// gradiente; um buffer zerado é preto uniforme.
#pragma once

#include <webgpu/webgpu.h>

struct HostGpu;

namespace render {

/** `true` quando a sonda está ligada por `CORTEX_DEPTH_PEEK`. */
bool depthPeekEnabled();

/**
 * Desenha a profundidade de `profundidade` sobre `alvoCor`, em tons de cinza.
 * Não usa teste de profundidade: o objetivo é ver o conteúdo, não respeitá-lo.
 */
void depthPeek(HostGpu* gpu, WGPUTexture alvoCor, WGPUTexture profundidade,
               WGPUTextureView viewProfundidade);

}  // namespace render
