// CortexNative host — M0 (PRD-0004) — composition root.
// O host é deliberadamente burro: janela + surface (core/app_window), runtime
// JS (core/js_runtime), shims de browser (shims/) e bindings WebGPU (webgpu/).
// TODO o trabalho gráfico é comandado pelo JavaScript (boot.hbc) — mesmo
// modelo do browser, mesmo modelo que o Three.js WebGPURenderer espera.

#include <SDL3/SDL.h>

#include <cstdio>
#include <string>

#include "core/app_window.h"
#include "core/crash_handler.h"
#include "core/gdk.h"
#include "core/host_gpu.h"
#include "core/js_runtime.h"
#include "core/steam.h"
#include "napi/napi_util.h"
#include "shims/animation_frame.h"
#include "shims/audio.h"
#include "shims/files.h"
#include "shims/image_decode.h"
#include "shims/input.h"
#include "shims/ktx2.h"
#include "shims/perf_stats.h"
#include "shims/quit.h"
#include "shims/rapier.h"
#include "shims/text_raster.h"
#include "shims/timers.h"
#include "shims/user_storage.h"
#include "webgpu/bindings.h"
#include "webgpu/splash.h"

namespace {

// Nome do jogo pra pasta de saves do usuário. Em dev vem do dir passado
// (`cortex_host.exe D:\jogos\teste4` → "teste4"); no export (sem argv[1]) vem do
// nome do EXE (`teste4.exe` → "teste4"). Basename sem extensão nem separador.
std::string deriveGameName(int argc, char** argv, const std::string& baseDir) {
  std::string src = (argc > 1 && argv[1] && argv[1][0]) ? std::string(argv[1])
                    : (argc > 0 && argv[0]) ? std::string(argv[0])
                                            : baseDir;
  // Tira a barra final (dir do jogo costuma vir com ela).
  while (!src.empty() && (src.back() == '\\' || src.back() == '/')) src.pop_back();
  size_t slash = src.find_last_of("\\/");
  std::string name = slash == std::string::npos ? src : src.substr(slash + 1);
  size_t dot = name.rfind('.');  // tira ".exe"
  if (dot != std::string::npos) name = name.substr(0, dot);
  return name;
}

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
//
// Enquanto a splash (ADR-0109) está no ar ela é a ÚNICA a apresentar: o frame do
// jogo é descartado, e o jogo carrega por trás sem aparecer. Apresentar os dois
// no mesmo vsync fazia a splash piscar, deixando o jogo vazar entre os frames.
void runFrame(core::JsRuntime& js, HostGpu* gpu, double elapsedMs,
              bool splashEnabled) {
  shims::runTimers(js.env(), elapsedMs);
  js.drainMicrotasks();
  shims::runAnimationFrames(js.env(), elapsedMs);
  js.drainMicrotasks();
  shims::updateAudio();
  core::runSteamCallbacks();  // overlay/conquistas — no-op sem CORTEX_STEAM
  if (splashEnabled && webgpu::splashPending()) {
    webgpu::splashFrame(gpu, elapsedMs);
  } else {
    webgpu::presentIfAcquired(gpu);
  }
  // Destruições adiadas de buffers/texturas: SÓ depois do present — um pass
  // gravado neste frame com o recurso ainda vivo passa na validação do submit.
  webgpu::flushDeferredDestroys();
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
  core::installCrashHandler();  // segfault vira backtrace no stderr, não exit mudo
  // Steam (release PC): checa relaunch-via-Steam + init ANTES de tudo. Se a Steam
  // vai relançar (app aberto fora dela), sai já. No-op sem CORTEX_STEAM.
  if (!core::initSteam()) return 0;

  // App model do GDK (console/Xbox): inicializa o Game Runtime cedo, antes de
  // qualquer outra API do GDK. No-op no build desktop (sem CORTEX_GDK).
  core::initGameRuntime();

  HostGpu gpu;
  // Tamanho só do modo janela (CORTEX_WINDOWED); em fullscreen usa a
  // resolução do display.
  SDL_Window* window = core::createAppWindow(&gpu, "cortex-native (M0)", 1280, 720);
  if (!window) return 1;

  {
    core::JsRuntime js;
    // Scope raiz do embedding: cobre o REGISTRO dos shims e os globals do boot
    // (valores criados fora de callback JS precisam de scope — ver
    // JsRuntime::HandleScope). Os frames abrem scopes próprios aninhados.
    core::JsRuntime::HandleScope bootScope{js.env()};
    // Diretório do jogo: argv[1] (boot.hbc + assets lidos de lá) ou, sem
    // argumento, a pasta do exe.
    const char* basePath = SDL_GetBasePath();
    std::string baseDir = basePath ? basePath : "";
    if (argc > 1 && argv[1] && argv[1][0]) {
      baseDir = argv[1];
      if (baseDir.back() != '\\' && baseDir.back() != '/') baseDir += '\\';
    }
    // Com o dir do jogo resolvido, o crash handler passa a gravar
    // <jogo>/error_log.txt além do stderr.
    core::installCrashHandler(baseDir.c_str());
    shims::registerTimers(js.env());
    shims::registerAnimationFrame(js.env());
    shims::registerInput(js.env());
    shims::registerFiles(js.env(), baseDir);
    shims::registerUserStorage(js.env(), deriveGameName(argc, argv, baseDir));
    shims::registerImageDecode(js.env());
    shims::registerKtx2(js.env());
    shims::registerPerfStats(js.env());
    shims::registerQuit(js.env());
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

    // Splash da engine (ADR-0109): obrigatória no jogo EXPORTADO. Só o dev pode
    // pulá-la (CORTEX_NO_SPLASH), e só quando roda o host apontando pra pasta do
    // jogo (`cortex_host.exe D:\jogos\teste4`) — o export nunca passa argv[1].
    const bool devRun = argc > 1 && argv[1] && argv[1][0];
    const bool splashEnabled = !(devRun && SDL_getenv("CORTEX_NO_SPLASH"));

    const uint64_t t0 = SDL_GetTicksNS();
    bool running = true;
    while (running) {
      // UM handle scope NAPI por frame: todo valor criado do lado nativo
      // (input, args de timers/rAF, perf stats) nasce e morre aqui — sem
      // scope aberto o NAPI upstream corrompe a marcação do GC (ver
      // JsRuntime::HandleScope).
      core::JsRuntime::HandleScope frameScope{js.env()};
      running = pollEvents(js.env(), window, &gpu);
      double elapsedMs =
          static_cast<double>(SDL_GetTicksNS() - t0) / 1'000'000.0;
      runFrame(js, &gpu, elapsedMs, splashEnabled);
    }
    webgpu::shutdownSplash();  // idempotente (a splash já se libera ao terminar)
    shims::closeGamepads();
    shims::shutdownAudio();
  }  // ~JsRuntime antes de liberar a GPU (JS pode segurar handles)

  shutdownGpu(&gpu);
  SDL_DestroyWindow(window);
  SDL_Quit();
  core::shutdownGameRuntime();  // no-op sem CORTEX_GDK
  core::shutdownSteam();        // no-op sem CORTEX_STEAM
  std::printf("cortex-native encerrou\n");
  return 0;
}
