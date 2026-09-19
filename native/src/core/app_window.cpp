#include "app_window.h"

#include <webgpu/wgpu.h>

#include <windows.h>

#include <cstdio>
#include <cstdlib>

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

// Prende a janela do host a um HWND externo (o painel do Studio) como janela
// **OWNED** — não como FILHA.
//
// A primeira versão usava `WS_CHILD` + `SetParent` (SPEC-0201) e **travava o
// Studio**: `SetParent` entre PROCESSOS acopla as filas de mensagens dos dois
// threads, então um host ocupado (carregando assets por ~40 s e depois rodando
// a ~45 ms por frame) segurava a UI do Electron junto — "Application Hang" no
// log de eventos do Windows (SPEC-0210).
//
// Janela OWNED (`GWLP_HWNDPARENT` num popup) fica sempre acima do dono,
// minimiza e restaura junto, e **não acopla as filas**. Em troca ela não é
// clipada pelo dono: quem posiciona (a IDE, pelo canal) manda coordenadas de
// TELA e esconde a janela quando o palco não está visível.
//
// Falha é não-fatal — o host segue como janela solta, melhor que não abrir.
void attachToParent(SDL_Window* window, const char* parentEnv, HostGpu* gpu) {
  const unsigned long long raw = std::strtoull(parentEnv, nullptr, 10);
  HWND parent = reinterpret_cast<HWND>(static_cast<uintptr_t>(raw));
  if (!parent || !IsWindow(parent)) {
    std::fprintf(stderr, "embed: CORTEX_PARENT_HWND invalido (%s)\n", parentEnv);
    return;
  }
  HWND self = static_cast<HWND>(gpu->hwnd);
  if (!self) return;
  // Popup sem borda (a moldura é a IDE) com DONO = janela do Studio.
  SetWindowLongPtrW(self, GWL_STYLE, WS_POPUP | WS_VISIBLE);
  SetWindowLongPtrW(self, GWLP_HWNDPARENT, reinterpret_cast<LONG_PTR>(parent));
  // NOACTIVATE: clicar no jogo não rouba o foco da IDE (é o que o iframe fazia).
  // TOOLWINDOW: some da barra de tarefas — é parte da IDE, não um app próprio.
  SetWindowLongPtrW(self, GWL_EXSTYLE, WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE);
  SetWindowPos(self, parent, 0, 0, 0, 0,
               SWP_NOSIZE | SWP_NOMOVE | SWP_FRAMECHANGED | SWP_SHOWWINDOW |
                   SWP_NOACTIVATE);
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
  // Debug/preview: CORTEX_WINDOWED=1 abre em janela REDIMENSIONÁVEL — o resize
  // deixou de crashar na SPEC-0199 (a surface é RECRIADA no início do frame).
  // EMBED (SPEC-0201 / M2 do PRD-0007): com CORTEX_PARENT_HWND a janela do host
  // vira FILHA de um HWND externo — o painel de preview do Studio. Implica
  // janela (nunca fullscreen) e sem borda: quem dá moldura é a IDE.
  const char* parentEnv = SDL_getenv("CORTEX_PARENT_HWND");
  const bool embedded = parentEnv != nullptr && parentEnv[0] != 0;
  const bool windowed = embedded || SDL_getenv("CORTEX_WINDOWED") != nullptr;
  // Em janela, RESIZABLE: é o modo de dev/preview, e o host agora aguenta o
  // resize (SPEC-0199 — a surface é recriada no início do frame). Sem a flag o
  // SDL rejeita o redimensionamento e a janela volta sozinha ao tamanho antigo.
  SDL_WindowFlags flags = windowed ? SDL_WINDOW_RESIZABLE : SDL_WINDOW_FULLSCREEN;
  if (embedded) flags |= SDL_WINDOW_BORDERLESS;
  SDL_Window* window = SDL_CreateWindow(title, width, height, flags);
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
  if (embedded) attachToParent(window, parentEnv, gpu);
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
