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

WGPUSurface createWindowSurface(WGPUInstance instance, SDL_Window* window) {
  SDL_PropertiesID props = SDL_GetWindowProperties(window);
  WGPUSurfaceSourceWindowsHWND source = WGPU_SURFACE_SOURCE_WINDOWS_HWND_INIT;
  source.hwnd = SDL_GetPointerProperty(
      props, SDL_PROP_WINDOW_WIN32_HWND_POINTER, nullptr);
  source.hinstance = SDL_GetPointerProperty(
      props, SDL_PROP_WINDOW_WIN32_INSTANCE_POINTER, nullptr);
  WGPUSurfaceDescriptor desc = WGPU_SURFACE_DESCRIPTOR_INIT;
  desc.nextInChain = &source.chain;
  return wgpuInstanceCreateSurface(instance, &desc);
}

void handleResize(SDL_Window* window, HostGpu* gpu) {
  SDL_GetWindowSizeInPixels(window, &gpu->width, &gpu->height);
  if (!gpu->configured || gpu->width <= 0 || gpu->height <= 0) return;
  gpu->config.width = static_cast<uint32_t>(gpu->width);
  gpu->config.height = static_cast<uint32_t>(gpu->height);
  wgpuSurfaceConfigure(gpu->surface, &gpu->config);
}

}  // namespace

SDL_Window* createAppWindow(HostGpu* gpu, const char* title, int width,
                            int height) {
  if (!SDL_Init(SDL_INIT_VIDEO | SDL_INIT_GAMEPAD)) {
    std::fprintf(stderr, "SDL_Init falhou: %s\n", SDL_GetError());
    return nullptr;
  }
  SDL_Window* window =
      SDL_CreateWindow(title, width, height, SDL_WINDOW_RESIZABLE);
  if (!window) {
    std::fprintf(stderr, "SDL_CreateWindow falhou: %s\n", SDL_GetError());
    return nullptr;
  }

  gpu->instance = createInstanceD3D12();
  if (!gpu->instance) {
    std::fprintf(stderr, "wgpuCreateInstance falhou\n");
    return nullptr;
  }
  gpu->surface = createWindowSurface(gpu->instance, window);
  if (!gpu->surface) {
    std::fprintf(stderr, "wgpuInstanceCreateSurface falhou\n");
    return nullptr;
  }
  SDL_GetWindowSizeInPixels(window, &gpu->width, &gpu->height);
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
