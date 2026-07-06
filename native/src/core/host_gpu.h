// Estado gráfico compartilhado entre o host (main.cpp) e os bindings WebGPU
// (src/webgpu/). O host cria instância+surface; adapter/device são adquiridos
// PELO JS via navigator.gpu (fiel ao modelo do browser).
#pragma once

#include <webgpu/webgpu.h>

struct HostGpu {
  WGPUInstance instance = nullptr;
  WGPUSurface surface = nullptr;
  // Fonte da surface (HWND/HINSTANCE) — pra RECRIAR a surface no resize
  // (reconfigurar a mesma dá "Invalid surface" no wgpu-native/D3D12).
  void* hwnd = nullptr;
  void* hinstance = nullptr;

  // Preenchidos pelos bindings quando o JS pede adapter/device.
  WGPUAdapter adapter = nullptr;
  WGPUDevice device = nullptr;
  WGPUQueue queue = nullptr;

  // Configuração corrente da surface. A reconfiguração NÃO acontece no
  // contextConfigure (JS) nem no resize direto — os dois só marcam
  // `wantConfigure`; o `ensureSurfaceConfigured` reconfigura UMA vez por
  // frame, no início, sem textura adquirida (senão o wgpu dá "Invalid
  // surface" e crasha o processo).
  WGPUSurfaceConfiguration config = WGPU_SURFACE_CONFIGURATION_INIT;
  WGPUTextureFormat preferredFormat = WGPUTextureFormat_BGRA8Unorm;
  WGPUTextureFormat requestedFormat = WGPUTextureFormat_BGRA8Unorm;
  bool configured = false;   // já foi configurada ao menos uma vez
  bool wantConfigure = false; // resize/configure pendente pro próximo frame
  int configuredWidth = 0;
  int configuredHeight = 0;

  // Dimensões atuais da janela (mantidas pelo host).
  int width = 0;
  int height = 0;

  // Textura do frame corrente (adquirida no getCurrentTexture do JS;
  // apresentada e liberada pelo host no fim do frame).
  WGPUTexture currentTexture = nullptr;

  // ── SSAA (supersampling) ──────────────────────────────────────────────────
  // O JS renderiza num alvo OFFSCREEN maior (nativo × renderScale) e o host
  // faz downscale pra swapchain no present — antialiasing dos contornos finos
  // (o MSAA 4x sozinho serrilha linhas de alto contraste, ex.: moedas).
  // renderScale = 1.0 desliga (renderiza direto na swapchain).
  float renderScale = 1.0f;
  WGPUTexture offscreenTexture = nullptr;  // alvo SS que o JS desenha
  WGPUTextureView offscreenView = nullptr;
  int offscreenWidth = 0;
  int offscreenHeight = 0;
};
