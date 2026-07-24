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
  // SSAA: só apresenta (blit do offscreen) nos frames em que o JS DE FATO
  // renderizou (chamou getCurrentTexture). Sem isto o present rodava TODO frame
  // (offscreenView é persistente) e o vsync travava o host em ~60fps —
  // serializando trabalho assíncrono pesado que renderiza pouco (ex.: buildScene
  // sob uma tela de loading): 0,7s virava ~18s.
  bool ssaaPending = false;

  // ── UI composta EM GAMA (ADR-0105) ────────────────────────────────────────
  // O JS (RendererUiBackend) desenha a UI de runtime numa RenderTarget PRÓPRIA
  // (linear premultiplicado) e passa a textura por `__cortexUiLayer` a cada
  // frame; o blit compõe sobre o offscreen do jogo EM GAMA
  // (out = game_srgb·(1−a) + OETF(ui/a)·a), casando o blend translúcido com o
  // DOM/CSS (o overlay linear do three saía lavado). Ver webgpu/supersample.cpp.
  bool uiCompositor = false;  // o JS usa o caminho de composição? (força offscreen)
  WGPUTexture uiTexture = nullptr;  // textura da UI do frame (NÃO-own: vive no three/JS)
  // A UI foi submetida NESTE frame? Dispara o present mesmo quando o jogo NÃO
  // renderizou (telas de menu rodam um loop só-UI, sem getCurrentTexture da
  // canvas). Resetado após o present — sem isso, o present rodaria todo frame do
  // host e o vsync serializaria trabalho async pesado (ver ssaaPending).
  bool uiPending = false;

  // ── Bloom + tone mapping NATIVOS (ADR-0147) ───────────────────────────────
  // Quando o jogo liga o bloom (`__cortexBloom`), o pós-processamento sai do JS
  // e roda aqui: as ~12 passadas da pirâmide custavam caro NÃO por pixel (render
  // scale 1.0 dava o mesmo FPS) e sim pela travessia JS→NAPI de cada passada.
  //
  // Ligado, o contrato do frame MUDA: o JS renderiza a cena em HDR LINEAR
  // (offscreen vira RGBA16Float, `toneMapping = NoToneMapping`) e o host faz
  // bloom → vinheta → ACES+exposição → gama → composição da UI, tudo no blit que
  // já existia. Desligado (padrão), NADA muda — o caminho antigo continua
  // idêntico, então os outros mundos/jogos não correm risco de regressão de cor.
  struct Bloom {
    bool enabled = false;
    float strength = 0.85f;
    float threshold = 0.45f;
    float radius = 0.6f;
    // Vinheta e tone mapping viajam junto porque passam a ser aplicados no
    // MESMO passe de composição (custo zero: é matemática num passe que já roda).
    float exposure = 1.0f;
    bool vignette = false;
    float vignetteIntensity = 0.55f;
    float vignetteInner = 0.32f;
    float vignetteOuter = 0.75f;
  } bloom;
};
