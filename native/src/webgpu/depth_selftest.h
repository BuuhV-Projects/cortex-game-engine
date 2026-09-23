// Autoteste da premissa de profundidade do ADR-0237 — DIAGNÓSTICO, isolado.
//
// A pergunta: duas passes SEQUENCIAIS, gravadas em command buffers SEPARADOS e
// submetidas separadamente, compartilhando a MESMA textura de profundidade, com
// a segunda usando `depthLoadOp = Load` — a segunda pass enxerga o que a
// primeira escreveu na profundidade?
//
// Diferente de um spike que mede a convivência com o `three` dentro do frame
// real do jogo, aqui NADA do `three` participa: texturas próprias,
// triângulos de tela cheia, resposta conhecida de antemão. É o caso isolado que
// falta para separar "a premissa não vale neste caminho wgpu/D3D12" de "tem
// alguma coisa do jogo no meio".
//
// Liga por `CORTEX_DEPTH_SELFTEST=1`; roda UMA vez, no primeiro frame em que já
// existe device, e imprime o veredito em stderr.
#pragma once

struct HostGpu;

namespace webgpu {

/**
 * Roda o autoteste uma única vez por processo e imprime o resultado em stderr.
 *
 * Sai sem fazer nada quando `CORTEX_DEPTH_SELFTEST` não está definida, quando o
 * device ainda não existe (o JS o adquire via `navigator.gpu`, então os
 * primeiros frames do host podem não ter device) ou quando já rodou.
 */
void runDepthSelftestOnce(HostGpu* gpu);

}  // namespace webgpu
