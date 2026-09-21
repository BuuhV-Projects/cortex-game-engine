// Spike do M5 (SPEC-0241, passo 0) — TEMPORÁRIO, sai depois de decidir.
//
// Responde a pergunta que decide o marco: **o C++ consegue desenhar no alvo
// real do `three` e devolver o controle para ele terminar o frame na mesma
// textura, sem corromper estado?**
//
// Diferente do `render_bench.cpp` (que cria device e textura próprios, isolado),
// aqui se usa o device, a queue e a textura REAIS do host — que é a situação
// que o M5 vai viver.
#pragma once

#include <cstdint>

#include <webgpu/webgpu.h>

struct HostGpu;

namespace webgpu {

/**
 * Abre uma pass própria no alvo do `three` e desenha um triângulo de cor
 * conhecida no centro, com escrita de profundidade.
 *
 * `limpar` decide o `loadOp`: o primeiro desenho do frame limpa cor e
 * profundidade; o `three` desenha depois com `load` e tem de PRESERVAR isto.
 *
 * `profundidadeNdc` é aplicada pelo viewport (`minDepth == maxDepth`), o que
 * evita precisar de uniforme e bind group só para escolher a distância: 0 põe o
 * marcador colado na câmera (deve tapar a cena), 1 o põe no fundo (a cena deve
 * tapá-lo). É essa diferença que prova se o teste de profundidade é respeitado
 * ENTRE as duas passes.
 */
bool spikeDrawMarker(HostGpu* gpu, WGPUTexture alvoCor, WGPUTexture alvoProfundidade,
                     float profundidadeNdc, bool limpar);

/**
 * Lê um pixel do alvo (formato de ponto flutuante de meia precisão) e devolve
 * os quatro canais já convertidos. Bloqueia até a GPU responder — é sonda, não
 * caminho de frame.
 */
bool spikeReadPixel(HostGpu* gpu, WGPUTexture alvoCor, uint32_t x, uint32_t y,
                    float canaisOut[4]);

}  // namespace webgpu
