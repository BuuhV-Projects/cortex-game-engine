// Janela SDL3 + instância/surface WebGPU do host. Responsabilidade única:
// dar ao resto do host uma janela com surface D3D12 pronta.
#pragma once

#include <SDL3/SDL.h>

#include "host_gpu.h"

namespace core {

// Cria janela + instância WebGPU (D3D12) + surface. Retorna nullptr em erro
// (a causa já foi logada). Preenche gpu->instance/surface/width/height.
SDL_Window* createAppWindow(HostGpu* gpu, const char* title, int width,
                            int height);

// Trata um evento SDL. Retorna false quando o app deve encerrar.
bool handleEvent(const SDL_Event& event, SDL_Window* window, HostGpu* gpu);

// **Recria** a surface a partir do HWND guardado em `gpu` (SPEC-0199).
// Reconfigurar a MESMA surface com um tamanho novo dá "Invalid surface" e
// crasha o wgpu-native/D3D12 — recriar é o caminho que funciona. Só pode ser
// chamada num ponto SEM textura de surface viva (início do frame).
// Retorna false se a criação falhar (a surface antiga é preservada).
bool recreateSurface(HostGpu* gpu);

}  // namespace core
