// SSAA (supersampling) — o JS renderiza num alvo offscreen maior (nativo ×
// renderScale) e o host faz downscale bilinear pra swapchain no present.
// Antialiasing dos contornos finos que o MSAA 4x sozinho serrilha.
#pragma once

#include <webgpu/webgpu.h>

#include "../core/host_gpu.h"

namespace webgpu {

// Garante o alvo offscreen no tamanho SS atual; devolve a view onde o JS
// desenha (ou nullptr se SSAA está desligado / device ausente).
WGPUTextureView ensureOffscreen(HostGpu* gpu);

// Faz o blit downscale do offscreen pra `swapchainView`. Cria o pipeline de
// blit sob demanda (fullscreen triangle + sampler linear). COMPÕE a UI em gama
// se `gpu->uiTexture` estiver setada (ADR-0105).
void blitToSwapchain(HostGpu* gpu, WGPUTextureView swapchainView);

// Limpa o offscreen (clear preto). Usado quando a UI é composta SEM render do
// jogo (menus): dá uma base limpa pro blit compor a UI por cima (ADR-0105).
void clearOffscreen(HostGpu* gpu);

}  // namespace webgpu
