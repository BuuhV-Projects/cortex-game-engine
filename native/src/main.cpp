// CortexNative host — M0 (PRD-0004) — composition root.
// O host é deliberadamente burro: janela + surface (core/app_window), runtime
// JS (core/js_runtime), shims de browser (shims/) e bindings WebGPU (webgpu/).
// TODO o trabalho gráfico é comandado pelo JavaScript (boot.hbc) — mesmo
// modelo do browser, mesmo modelo que o Three.js WebGPURenderer espera.

#include <SDL3/SDL.h>

#include <cstdio>
#include <string>

#include "core/app_window.h"
#include "core/host_gpu.h"
#include "core/js_runtime.h"
#include "napi/napi_util.h"
#include "shims/animation_frame.h"
#include "shims/audio.h"
#include "shims/files.h"
#include "shims/image_decode.h"
#include "shims/input.h"
#include "shims/rapier.h"
#include "shims/text_raster.h"
#include "shims/timers.h"
#include "webgpu/bindings.h"

namespace {

bool pollEvents(napi_env env, SDL_Window* window, HostGpu* gpu) {
  SDL_Event event;
  while (SDL_PollEvent(&event)) {
    if (shims::handleSdlInputEvent(env, event)) continue;
    if (!core::handleEvent(event, window, gpu)) return false;
    // Resize: o host já reconfigurou a surface; avisa o JS pra o engine
    // re-dimensionar o renderer (câmeras/targets) na resolução nova.
    if (event.type == SDL_EVENT_WINDOW_PIXEL_SIZE_CHANGED && gpu->width > 0) {
      napi_value global = nullptr;
      napi_get_global(env, &global);
      napi_value fn = nullptr;
      if (njs::getNamed(env, global, "__cortexResize", &fn)) {
        // Tamanho LÓGICO (nativo) — o dpr (renderScale) leva pro backing SS via
        // three, casando com o offscreen (nativo × renderScale). Passar SS aqui
        // dobraria a escala.
        napi_value args[2];
        napi_create_double(env, gpu->width, &args[0]);
        napi_create_double(env, gpu->height, &args[1]);
        njs::callJsLogged(env, fn, 2, args, "resize");
      }
    }
  }
  return true;
}

// Um frame: timers → rAF (o JS grava e submete; a surface reconfigura
// sozinha no getCurrentTexture se a janela mudou) → present.
void runFrame(core::JsRuntime& js, HostGpu* gpu, double elapsedMs) {
  shims::runTimers(js.env(), elapsedMs);
  js.drainMicrotasks();
  shims::runAnimationFrames(js.env(), elapsedMs);
  js.drainMicrotasks();
  shims::updateAudio();
  webgpu::presentIfAcquired(gpu);
}

void shutdownGpu(HostGpu* gpu) {
  if (gpu->queue) wgpuQueueRelease(gpu->queue);
  if (gpu->device) wgpuDeviceRelease(gpu->device);
  if (gpu->adapter) wgpuAdapterRelease(gpu->adapter);
  if (gpu->surface) wgpuSurfaceRelease(gpu->surface);
  if (gpu->instance) wgpuInstanceRelease(gpu->instance);
}

}  // namespace

int main(int argc, char** argv) {
  HostGpu gpu;
  // Tamanho só do modo janela (CORTEX_WINDOWED); em fullscreen usa a
  // resolução do display.
  SDL_Window* window = core::createAppWindow(&gpu, "cortex-native (M0)", 1280, 720);
  if (!window) return 1;

  {
    core::JsRuntime js;
    // Diretório do jogo: argv[1] (boot.hbc + assets lidos de lá) ou, sem
    // argumento, a pasta do exe.
    const char* basePath = SDL_GetBasePath();
    std::string baseDir = basePath ? basePath : "";
    if (argc > 1 && argv[1] && argv[1][0]) {
      baseDir = argv[1];
      if (baseDir.back() != '\\' && baseDir.back() != '/') baseDir += '\\';
    }
    shims::registerTimers(js.env());
    shims::registerAnimationFrame(js.env());
    shims::registerInput(js.env());
    shims::registerFiles(js.env(), baseDir);
    shims::registerImageDecode(js.env());
    shims::registerRapier(js.env());
    shims::registerAudio(js.env());
    shims::registerTextRaster(js.env(), baseDir, basePath ? basePath : "");
    webgpu::registerBindings(js.env(), &gpu);

    // SSAA (supersampling): o engine renderiza numa canvas MAIOR (nativo ×
    // renderScale) num alvo offscreen; o host faz downscale bilinear no
    // present. Mata o serrilhado dos contornos finos (moedas) que o MSAA 4x
    // sozinho não suaviza. CORTEX_RENDER_SCALE ajusta (padrão 2.0; 1.0 desliga).
    {
      const char* scaleEnv = SDL_getenv("CORTEX_RENDER_SCALE");
      float scale = scaleEnv ? static_cast<float>(SDL_atof(scaleEnv)) : 2.0f;
      if (scale < 1.0f) scale = 1.0f;
      if (scale > 4.0f) scale = 4.0f;  // teto de sanidade (VRAM/fill-rate)
      gpu.renderScale = scale;
    }

    // Deep-link de fase / query de lançamento (env CORTEX_LAUNCH_QUERY →
    // location.search): atalho/export pode abrir direto numa fase
    // ("?level=fase-1"); vazio = fluxo normal (menu).
    {
      const char* query = SDL_getenv("CORTEX_LAUNCH_QUERY");
      if (query && query[0]) {
        napi_value global = nullptr, s = nullptr;
        napi_get_global(js.env(), &global);
        napi_create_string_utf8(js.env(), query, NAPI_AUTO_LENGTH, &s);
        napi_set_named_property(js.env(), global, "__cortexSearch", s);
      }
    }

    // Tamanho LÓGICO da canvas (nativo) + devicePixelRatio = renderScale, pro
    // JS ANTES do boot. Modelo fiel ao browser: o engine faz layout em px
    // lógicos (innerWidth = nativo) e o three multiplica por dpr pro backing
    // (o offscreen SS). Assim a UI (px lógicos) NÃO encolhe com o SSAA — antes,
    // com innerWidth = SS, o menu ficava minúsculo depois do downscale.
    {
      napi_value global = nullptr;
      napi_get_global(js.env(), &global);
      napi_value w = nullptr, h = nullptr, dpr = nullptr;
      napi_create_double(js.env(), gpu.width, &w);
      napi_create_double(js.env(), gpu.height, &h);
      napi_create_double(js.env(), gpu.renderScale, &dpr);
      napi_set_named_property(js.env(), global, "__cortexWidth", w);
      napi_set_named_property(js.env(), global, "__cortexHeight", h);
      napi_set_named_property(js.env(), global, "__cortexPixelRatio", dpr);
    }

    if (!js.runBoot(baseDir)) return 1;
    js.drainMicrotasks();

    const uint64_t t0 = SDL_GetTicksNS();
    bool running = true;
    while (running) {
      running = pollEvents(js.env(), window, &gpu);
      double elapsedMs =
          static_cast<double>(SDL_GetTicksNS() - t0) / 1'000'000.0;
      runFrame(js, &gpu, elapsedMs);
    }
    shims::closeGamepads();
    shims::shutdownAudio();
  }  // ~JsRuntime antes de liberar a GPU (JS pode segurar handles)

  shutdownGpu(&gpu);
  SDL_DestroyWindow(window);
  SDL_Quit();
  std::printf("cortex-native encerrou\n");
  return 0;
}
