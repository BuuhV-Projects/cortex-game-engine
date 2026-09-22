// Passe de sombra nativo, depth-only (SPEC-0245, E5 do passo 2 — M6).
//
// Desenha os casters enumerados em C++ direto na `ShadowDepthTexture` da
// cascata, no lugar do passe que o `three` faz em JS. Três decisões o separam
// de uma pass qualquer, e todas as três foram medidas antes de virar código:
//
//  - **sem attachment de cor.** O passe é depth-only: o `three` já usa um
//    `overrideMaterial` único e não lê a cor do shadow map com PCF/PCFSoft.
//  - **o alvo vem por IDENTIDADE**, do `shadow.map.depthTexture` que o JS
//    entrega. Identificar alvo por dimensão custou dois dias no M5 (SPEC-0241)
//    e acabou desenhando na textura errada — aqui nada é adivinhado.
//  - **`cullMode = Front`.** O `three` inverte o lado da face no passe de
//    sombra (`_shadowSide`: `FrontSide → BackSide`). Com `Back`, a
//    profundidade sairia da face errada — acne e peter-panning. É a premissa 4
//    do contrato do `three` (SPEC-0246): se ele parar de inverter, o teste
//    quebra antes da imagem.
//
// Diagnóstico: `CORTEX_SHADOW_PASS_LOG=1` imprime no stderr as primeiras
// chamadas com alvo, formato e quantos casters entraram. É a única forma de
// responder "o nativo assumiu, e desenhou o quê?" numa máquina de campo, onde
// não há depurador — o lado JS relata a decisão, este lado relata o desenho.
#pragma once

#include <cstdint>

#include <webgpu/webgpu.h>

struct HostGpu;

namespace render {

/** Um caster a desenhar: geometria registrada + matriz de mundo. */
struct ShadowDrawItem {
  uint32_t geometryId = 0;
  /**
   * Matriz de mundo, coluna-maior, em DOUBLE.
   *
   * Double até o último momento possível: a multiplicação `viewProj × model`
   * acontece aqui, em `double`, e só o resultado vira `float`. Degradar antes
   * é o caminho conhecido para as bandas da SPEC-0234 — numa cidade de
   * centenas de metros o `float32` perde dígitos suficientes para a
   * profundidade da sombra ganhar degraus.
   */
  double model[16] = {};
};

/**
 * Abre uma pass depth-only em `alvoProfundidade` (limpando-a) e desenha os
 * casters.
 *
 * `alvoProfundidade` é reaquirida por frame por quem chama, nunca cacheada
 * aqui: o `three` recria a textura quando a dimensão do shadow map muda, e um
 * handle guardado passaria a apontar para um recurso morto.
 *
 * Devolve quantos itens foram desenhados; caster cuja geometria não está no
 * registro é **pulado**, nunca aproximado — e o gate (E3) já deveria ter
 * recusado o frame antes de chegar aqui.
 */
uint32_t drawShadowCasters(HostGpu* gpu, WGPUTexture alvoProfundidade,
                           const double viewProjection[16], const ShadowDrawItem* itens,
                           uint32_t total);

}  // namespace render
