// Bloom NATIVO (ADR-0147) — a pirâmide de brilho encodada em C++, sobre o mesmo
// alvo offscreen que o SSAA já usa.
//
// Por que existe: no host o custo do bloom NÃO é de pixel (render scale 1.0, com
// ¼ dos pixels, dava o mesmo FPS) e sim da travessia JS→NAPI de cada passada —
// eram ~12 passadas do `BloomNode` do three, ~4ms/frame só de marshalling. Aqui
// as mesmas passadas viram chamadas diretas ao wgpu.
//
// A MATEMÁTICA mora em `native/shaders/bloom.wgsl` (fonte única compartilhada com
// o backend de browser do engine); este arquivo só orquestra.
#pragma once

#include <node_api.h>
#include <webgpu/webgpu.h>

#include "../core/host_gpu.h"

namespace webgpu {

/**
 * Expõe `__cortexBloom(config)` ao JS — o contrato de pós-processamento do host.
 *
 * `config` é um objeto (ou `null`/omitido pra DESLIGAR):
 * ```js
 * __cortexBloom({ strength, threshold, radius,
 *                 exposure, vignette, vignetteIntensity,
 *                 vignetteInner, vignetteOuter })
 * ```
 * Chame UMA vez ao montar/trocar a fase — não por frame. Ligado, o jogo passa a
 * dever renderizar em LINEAR HDR (`toneMapping = NoToneMapping`): a exposição, o
 * ACES e a vinheta passam a ser aplicados aqui.
 */
void registerBloom(napi_env env);

// Encoda bright pass + downsamples + upsamples aditivos sobre `srcView` (a cena
// em LINEAR HDR, `srcW`×`srcH`). Chame ANTES do composite. (re)cria a pirâmide se
// o tamanho da fonte mudou.
void renderBloom(HostGpu* gpu, WGPUTextureView srcView, int srcW, int srcH);

// View do resultado (nível 0 da pirâmide), ou `nullptr` se indisponível.
WGPUTextureView bloomResultView();

// Libera tudo (resize do offscreen ou fim de sessão).
void destroyBloom();

}  // namespace webgpu
