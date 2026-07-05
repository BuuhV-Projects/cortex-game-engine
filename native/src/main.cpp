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
#include "shims/animation_frame.h"
#include "shims/audio.h"
#include "shims/files.h"
#include "shims/image_decode.h"
#include "shims/input.h"
#include "shims/rapier.h"
#include "shims/timers.h"
#include "webgpu/bindings.h"

namespace {

bool pollEvents(napi_env env, SDL_Window* window, HostGpu* gpu) {
  SDL_Event event;
  while (SDL_PollEvent(&event)) {
    if (shims::handleSdlInputEvent(env, event)) continue;
    if (!core::handleEvent(event, window, gpu)) return false;
  }
  return true;
}

// Um frame: timers vencidos → rAF (o JS grava e submete) → present.
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

int main(int, char**) {
  HostGpu gpu;
  SDL_Window* window = core::createAppWindow(&gpu, "cortex-native (M0)", 1280, 720);
  if (!window) return 1;

  {
    core::JsRuntime js;
    const char* basePath = SDL_GetBasePath();
    std::string baseDir = basePath ? basePath : "";
    shims::registerTimers(js.env());
    shims::registerAnimationFrame(js.env());
    shims::registerInput(js.env());
    shims::registerFiles(js.env(), baseDir);
    shims::registerImageDecode(js.env());
    shims::registerRapier(js.env());
    shims::registerAudio(js.env());
    webgpu::registerBindings(js.env(), &gpu);

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
