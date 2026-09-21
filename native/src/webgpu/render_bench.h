// Spike do laço de render nativo (ADR-0232, fase 1).
//
// Desenha N objetos com o laço POR OBJETO inteiramente em C++ — matriz de
// mundo, frustum culling, uniforme por objeto e draw — sem `three` e sem JS no
// caminho, e mede o custo por draw.
//
// O número que sai daqui decide a migração: o laço equivalente em JS custa
// **33,5 us por draw** no mesmo host (SPEC-0227). O ADR-0232 fixou as faixas de
// decisão ANTES de medir, para a conclusão não ser escolhida depois do
// resultado.
#pragma once

struct HostGpu;

namespace webgpu {

/**
 * Roda o spike e imprime o resultado. `objetos` e `frames` vêm da linha de
 * comando/env; devolve `false` se não conseguiu nem criar o device.
 *
 * Cria device próprio e desenha em textura offscreen: o spike não depende do
 * JS ter subido nem de haver janela, e mede só o custo de CPU do laço.
 */
bool runRenderBench(int objetos, int frames);

}  // namespace webgpu
