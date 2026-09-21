// Sonda de profundidade (SPEC-0241, passo 3) — TEMPORÁRIA.
//
// Pinta na cor o que está no buffer de profundidade. Existe porque inferir o
// conteúdo pelo comportamento do teste levou a conclusões erradas duas vezes:
// "a cena ocluiu" e "a diferença é numérica" explicavam os dados tão bem quanto
// "o buffer está zerado", e só lendo dá para separar.
//
// ATENÇÃO — ESTE INSTRUMENTO NÃO É VÁLIDO NESTA PLATAFORMA. Medido em
// 21/09/2026 (SPEC-0241): apontada para a profundidade PRÓPRIA do passe, que é
// limpa com 1.0 todo frame e portanto não pode ler zero, ela lê zero mesmo
// assim. O pipeline roda (uma cor constante cobre a tela) e a textura chega ao
// shader com as dimensões certas (textureDimensions devolve 2560x1440), mas
// textureLoad sobre texture_depth_2d devolve 0 sempre. Não use a saída desta
// sonda como evidência de nada: ela só sobrevive no repo como registro do que
// já foi tentado. Um teste de oclusão tem de ser comportamental.
#pragma once

#include <webgpu/webgpu.h>

struct HostGpu;

namespace render {

/** `true` quando a sonda está ligada por `CORTEX_DEPTH_PEEK`. */
bool depthPeekEnabled();

/**
 * Modo da sonda, de `CORTEX_DEPTH_PEEK`:
 *   1 = sonda a profundidade do `three` (a investigação da oclusão)
 *   2 = sonda a profundidade PRÓPRIA do passe, depois de ele desenhar —
 *       serve para validar o instrumento: ali o conteúdo comprovadamente
 *       existe, então preto ali significa sonda quebrada, não buffer vazio.
 */
int depthPeekMode();

/**
 * Desenha a profundidade de `profundidade` sobre `alvoCor`, em tons de cinza.
 * Não usa teste de profundidade: o objetivo é ver o conteúdo, não respeitá-lo.
 */
void depthPeek(HostGpu* gpu, WGPUTexture alvoCor, WGPUTexture profundidade,
               WGPUTextureView viewProfundidade);

}  // namespace render
