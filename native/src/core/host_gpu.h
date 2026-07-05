// Estado gráfico compartilhado entre o host (main.cpp) e os bindings WebGPU
// (src/webgpu/). O host cria instância+surface; adapter/device são adquiridos
// PELO JS via navigator.gpu (fiel ao modelo do browser).
#pragma once

#include <webgpu/webgpu.h>

struct HostGpu {
  WGPUInstance instance = nullptr;
  WGPUSurface surface = nullptr;

  // Preenchidos pelos bindings quando o JS pede adapter/device.
  WGPUAdapter adapter = nullptr;
  WGPUDevice device = nullptr;
  WGPUQueue queue = nullptr;

  // Configuração corrente da surface (bindings configuram; host reusa no resize).
  WGPUSurfaceConfiguration config = WGPU_SURFACE_CONFIGURATION_INIT;
  WGPUTextureFormat preferredFormat = WGPUTextureFormat_BGRA8Unorm;
  bool configured = false;

  // Dimensões atuais da janela (mantidas pelo host).
  int width = 0;
  int height = 0;

  // Textura do frame corrente (adquirida no getCurrentTexture do JS;
  // apresentada e liberada pelo host no fim do frame).
  WGPUTexture currentTexture = nullptr;
};
