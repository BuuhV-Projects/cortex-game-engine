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

WGPUSurface surfaceFromHandles(WGPUInstance instance, void* hwnd, void* hinstance) {
  WGPUSurfaceSourceWindowsHWND source = WGPU_SURFACE_SOURCE_WINDOWS_HWND_INIT;
  source.hwnd = hwnd;
  source.hinstance = hinstance;
  WGPUSurfaceDescriptor desc = WGPU_SURFACE_DESCRIPTOR_INIT;
  desc.nextInChain = &source.chain;
  return wgpuInstanceCreateSurface(instance, &desc);
}

WGPUSurface createWindowSurface(WGPUInstance instance, SDL_Window* window,
                                HostGpu* gpu) {
  SDL_PropertiesID props = SDL_GetWindowProperties(window);
  gpu->hwnd = SDL_GetPointerProperty(
      props, SDL_PROP_WINDOW_WIN32_HWND_POINTER, nullptr);
  gpu->hinstance = SDL_GetPointerProperty(
      props, SDL_PROP_WINDOW_WIN32_INSTANCE_POINTER, nullptr);
  return surfaceFromHandles(instance, gpu->hwnd, gpu->hinstance);
}

void handleResize(SDL_Window* window, HostGpu* gpu) {
  // SÓ atualiza as dimensões e marca a pendência. Mexer na surface aqui, no
  // meio do frame (com textura possivelmente adquirida), é o que dava "Invalid
  // surface" e crash — quem age é o início do frame (SPEC-0199).
  SDL_GetWindowSizeInPixels(window, &gpu->width, &gpu->height);
  gpu->wantConfigure = true;
}

}  // namespace

SDL_Window* createAppWindow(HostGpu* gpu, const char* title, int width,
                            int height) {
  if (!SDL_Init(SDL_INIT_VIDEO | SDL_INIT_GAMEPAD | SDL_INIT_AUDIO)) {
    std::fprintf(stderr, "SDL_Init falhou: %s\n", SDL_GetError());
    return nullptr;
  }
  // FULLSCREEN por padrão (como jogo/console): renderiza na resolução NATIVA
  // do desktop — imagem SHARP, sem o upscale borrado do modo janela.
  // Debug: CORTEX_WINDOWED=1 abre em janela REDIMENSIONÁVEL — o resize
  // deixou de crashar na SPEC-0199 (a surface é RECRIADA no início do frame).
  const bool windowed = SDL_getenv("CORTEX_WINDOWED") != nullptr;
  // Em janela, RESIZABLE: é o modo de dev, e o host agora aguenta o resize
  // (SPEC-0199 — a surface é recriada no início do frame). Sem a flag o SDL
  // rejeita o redimensionamento e a janela volta sozinha ao tamanho antigo.
  SDL_WindowFlags flags = windowed ? SDL_WINDOW_RESIZABLE : SDL_WINDOW_FULLSCREEN;
  SDL_Window* window = SDL_CreateWindow(title, width, height, flags);
  if (!window) {
    std::fprintf(stderr, "SDL_CreateWindow falhou: %s\n", SDL_GetError());
    return nullptr;
  }
  // Janela oculta (SPEC-0240, passo 0/1): roda o harness de paridade visual
  // (e outros modos de captura/benchmark headless) sem tirar o foco nem
  // aparecer na tela do dono da máquina. Medido no passo 0: com
  // `SDL_HideWindow`, `width`/`height` continuam positivos e o loop de
  // present segue desenhando normalmente (240 frames, 0 abortados) —
  // minimizar de verdade NÃO serve (zera o pixel size e aborta a aquisição
  // em acquireSurfaceTexture).
  if (SDL_getenv("CORTEX_WINDOW_HIDDEN") != nullptr) {
    SDL_HideWindow(window);
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

bool recreateSurface(HostGpu* gpu) {
  if (!gpu || !gpu->instance || !gpu->hwnd) return false;
  WGPUSurface fresh = surfaceFromHandles(gpu->instance, gpu->hwnd, gpu->hinstance);
  if (!fresh) {
    std::fprintf(stderr, "recreateSurface: wgpuInstanceCreateSurface falhou\n");
    return false;  // segue com a surface antiga (imagem esticada > crash)
  }
  if (gpu->surface) {
    wgpuSurfaceUnconfigure(gpu->surface);
    wgpuSurfaceRelease(gpu->surface);
  }
  gpu->surface = fresh;
  // Força a reconfiguração: a surface nova nasce sem configuração nenhuma.
  gpu->configuredWidth = 0;
  gpu->configuredHeight = 0;
  return true;
}

}  // namespace core
