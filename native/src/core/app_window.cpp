#include "app_window.h"

#include <webgpu/wgpu.h>

#include <cstdio>

namespace core {
namespace {

WGPUInstance createInstanceD3D12() {
  // D3D12 explícito: é o backend do caminho console (GDK) — manter PC e
  // Xbox na mesma pilha gráfica desde o M0.
  WGPUInstanceExtras extras = {};
  extras.chain.sType = (WGPUSType)WGPUSType_InstanceExtras;
  extras.backends = WGPUInstanceBackend_DX12;
  WGPUInstanceDescriptor desc = WGPU_INSTANCE_DESCRIPTOR_INIT;
  desc.nextInChain = &extras.chain;
  return wgpuCreateInstance(&desc);
}

WGPUSurface createWindowSurface(WGPUInstance instance, SDL_Window* window,
                                HostGpu* gpu) {
  SDL_PropertiesID props = SDL_GetWindowProperties(window);
  gpu->hwnd = SDL_GetPointerProperty(
      props, SDL_PROP_WINDOW_WIN32_HWND_POINTER, nullptr);
  gpu->hinstance = SDL_GetPointerProperty(
      props, SDL_PROP_WINDOW_WIN32_INSTANCE_POINTER, nullptr);
  WGPUSurfaceSourceWindowsHWND source = WGPU_SURFACE_SOURCE_WINDOWS_HWND_INIT;
  source.hwnd = gpu->hwnd;
  source.hinstance = gpu->hinstance;
  WGPUSurfaceDescriptor desc = WGPU_SURFACE_DESCRIPTOR_INIT;
  desc.nextInChain = &source.chain;
  return wgpuInstanceCreateSurface(instance, &desc);
}

void handleResize(SDL_Window* window, HostGpu* gpu) {
  // SÓ atualiza as dimensões. A surface se reconfigura sozinha no próximo
  // getCurrentTexture (ponto sem textura viva) quando detecta a mudança —
  // reconfigurar aqui, no meio do frame, dava "Invalid surface" e crash.
  SDL_GetWindowSizeInPixels(window, &gpu->width, &gpu->height);
}

}  // namespace

SDL_Window* createAppWindow(HostGpu* gpu, const char* title, int width,
                            int height) {
  if (!SDL_Init(SDL_INIT_VIDEO | SDL_INIT_GAMEPAD | SDL_INIT_AUDIO)) {
    std::fprintf(stderr, "SDL_Init falhou: %s\n", SDL_GetError());
    return nullptr;
  }
  // FULLSCREEN por padrão (como jogo/console): renderiza na resolução NATIVA
  // do desktop — imagem SHARP (sem o upscale borrado do modo janela) — e é de
  // tamanho FIXO. Reconfigurar a surface do wgpu-native/D3D12 após um resize
  // dá "Invalid surface" e crasha (bug do backend); em tamanho fixo a surface
  // configura UMA vez e nunca mais. Trocar de resolução = reiniciar o jogo.
  // Debug: CORTEX_WINDOWED=1 abre em janela (mais fácil de inspecionar).
  const bool windowed = SDL_getenv("CORTEX_WINDOWED") != nullptr;
  SDL_Window* window = SDL_CreateWindow(
      title, width, height, windowed ? 0 : SDL_WINDOW_FULLSCREEN);
  if (!window) {
    std::fprintf(stderr, "SDL_CreateWindow falhou: %s\n", SDL_GetError());
    return nullptr;
  }
  // Deixa o fullscreen assentar ANTES de ler o tamanho (senão o engine cria
  // os alvos no tamanho inicial da janela e não bate com a swapchain).
  SDL_SyncWindow(window);

  gpu->instance = createInstanceD3D12();
  if (!gpu->instance) {
    std::fprintf(stderr, "wgpuCreateInstance falhou\n");
    return nullptr;
  }
  gpu->surface = createWindowSurface(gpu->instance, window, gpu);
  if (!gpu->surface) {
    std::fprintf(stderr, "wgpuInstanceCreateSurface falhou\n");
    return nullptr;
  }
  // Em FULLSCREEN a swapchain assume a resolução do DISPLAY — pego ela direto
  // do modo do desktop (o GetWindowSizeInPixels pode devolver o tamanho
  // inicial antes da transição assentar → mismatch depth×color e crash).
  if (!windowed) {
    SDL_DisplayID display = SDL_GetDisplayForWindow(window);
    if (display == 0) display = SDL_GetPrimaryDisplay();  // ainda não assentou
    const SDL_DisplayMode* mode = SDL_GetDesktopDisplayMode(display);
    if (mode) {
      gpu->width = static_cast<int>(mode->w * mode->pixel_density);
      gpu->height = static_cast<int>(mode->h * mode->pixel_density);
    }
  }
  if (gpu->width <= 0 || gpu->height <= 0) {
    SDL_GetWindowSizeInPixels(window, &gpu->width, &gpu->height);
  }
  return window;
}

bool handleEvent(const SDL_Event& event, SDL_Window* window, HostGpu* gpu) {
  switch (event.type) {
    case SDL_EVENT_QUIT:
      return false;
    case SDL_EVENT_WINDOW_PIXEL_SIZE_CHANGED:
      handleResize(window, gpu);
      return true;
    default:
      return true;
  }
}

}  // namespace core
