// CortexNative host — M0 (PRD-0004)
// Marco A: janela SDL3 + WebGPU nativo (wgpu-native, backend D3D12).
// Marco B: Hermes embutido — o JS comanda o frame (tick() decide a cor do
// clear), provando o ciclo JS → nativo → GPU sem browser.

#include <SDL3/SDL.h>
#include <webgpu/webgpu.h>
#include <webgpu/wgpu.h>

#include <hermes/hermes_api.h>

#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>

namespace {

// ───────────────────────── WebGPU: aquisição síncrona ─────────────────────
// O wgpu-native não implementa wgpuInstanceWaitAny (panic "not implemented"
// na v29); o padrão suportado é AllowProcessEvents + bombear
// wgpuInstanceProcessEvents até o callback disparar.
struct AdapterResult {
  WGPUAdapter adapter = nullptr;
  bool done = false;
};
struct DeviceResult {
  WGPUDevice device = nullptr;
  bool done = false;
};

void pumpUntil(WGPUInstance instance, const bool& done) {
  while (!done) wgpuInstanceProcessEvents(instance);
}

// ───────────────────────── Hermes: helpers Node-API ────────────────────────
[[noreturn]] void napiFail(napi_env env, napi_status status, const char* what) {
  std::fprintf(stderr, "%s falhou (napi_status %d)\n", what,
               static_cast<int>(status));
  bool pending = false;
  napi_is_exception_pending(env, &pending);
  if (pending) {
    napi_value exception = nullptr;
    napi_get_and_clear_last_exception(env, &exception);
    napi_value asString = nullptr;
    if (napi_coerce_to_string(env, exception, &asString) == napi_ok) {
      char buffer[1024];
      size_t length = 0;
      napi_get_value_string_utf8(env, asString, buffer, sizeof(buffer),
                                 &length);
      std::fprintf(stderr, "exceção JS: %.*s\n", static_cast<int>(length),
                   buffer);
    }
  }
  std::exit(1);
}

void check(napi_env env, napi_status status, const char* what) {
  if (status != napi_ok) napiFail(env, status, what);
}

// print(...args) — instrumentação básica do runtime JS no host.
napi_value jsPrint(napi_env env, napi_callback_info info) {
  size_t argc = 8;
  napi_value args[8];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  for (size_t i = 0; i < argc; ++i) {
    napi_value asString = nullptr;
    if (napi_coerce_to_string(env, args[i], &asString) != napi_ok) continue;
    char buffer[1024];
    size_t length = 0;
    napi_get_value_string_utf8(env, asString, buffer, sizeof(buffer), &length);
    std::printf("%s%.*s", i ? " " : "[js] ", static_cast<int>(length), buffer);
  }
  std::printf("\n");
  std::fflush(stdout);
  napi_value undefined = nullptr;
  napi_get_undefined(env, &undefined);
  return undefined;
}

// Script de boot do M0 — no futuro vira o bundle .hbc do jogo (hermesc).
const char* kBootScript = R"JS(
print('cortex-native: JS vivo no Hermes');
let phase = 0;
globalThis.tick = function (frame) {
  const t = frame / 60;
  phase = t * 0.7;
  return [
    0.05 + 0.05 * Math.sin(t),
    0.02 + 0.06 * Math.abs(Math.sin(phase * 0.5)),
    0.10 + 0.08 * Math.sin(phase),
  ];
};
print('tick() registrado — JS comanda o clear color');
)JS";

}  // namespace

int main(int, char**) {
  if (!SDL_Init(SDL_INIT_VIDEO | SDL_INIT_GAMEPAD)) {
    std::fprintf(stderr, "SDL_Init falhou: %s\n", SDL_GetError());
    return 1;
  }

  SDL_Window* window = SDL_CreateWindow("cortex-native (M0)", 1280, 720,
                                        SDL_WINDOW_RESIZABLE);
  if (!window) {
    std::fprintf(stderr, "SDL_CreateWindow falhou: %s\n", SDL_GetError());
    return 1;
  }

  // ── Instância WebGPU — D3D12 explícito: é o backend do caminho console
  // (GDK); manter PC e Xbox na mesma pilha gráfica desde o M0.
  WGPUInstanceExtras extras = {};
  extras.chain.sType = (WGPUSType)WGPUSType_InstanceExtras;
  extras.backends = WGPUInstanceBackend_DX12;
  WGPUInstanceDescriptor instanceDesc = WGPU_INSTANCE_DESCRIPTOR_INIT;
  instanceDesc.nextInChain = &extras.chain;
  WGPUInstance instance = wgpuCreateInstance(&instanceDesc);
  if (!instance) {
    std::fprintf(stderr, "wgpuCreateInstance falhou\n");
    return 1;
  }

  // ── Surface a partir do HWND da janela SDL ──
  SDL_PropertiesID props = SDL_GetWindowProperties(window);
  void* hwnd =
      SDL_GetPointerProperty(props, SDL_PROP_WINDOW_WIN32_HWND_POINTER, nullptr);
  void* hinstance = SDL_GetPointerProperty(
      props, SDL_PROP_WINDOW_WIN32_INSTANCE_POINTER, nullptr);

  WGPUSurfaceSourceWindowsHWND surfaceSource =
      WGPU_SURFACE_SOURCE_WINDOWS_HWND_INIT;
  surfaceSource.hinstance = hinstance;
  surfaceSource.hwnd = hwnd;
  WGPUSurfaceDescriptor surfaceDesc = WGPU_SURFACE_DESCRIPTOR_INIT;
  surfaceDesc.nextInChain = &surfaceSource.chain;
  WGPUSurface surface = wgpuInstanceCreateSurface(instance, &surfaceDesc);
  if (!surface) {
    std::fprintf(stderr, "wgpuInstanceCreateSurface falhou\n");
    return 1;
  }

  // ── Adapter ──
  AdapterResult adapterResult;
  WGPURequestAdapterOptions adapterOpts = WGPU_REQUEST_ADAPTER_OPTIONS_INIT;
  adapterOpts.compatibleSurface = surface;
  WGPURequestAdapterCallbackInfo adapterCb =
      WGPU_REQUEST_ADAPTER_CALLBACK_INFO_INIT;
  adapterCb.mode = WGPUCallbackMode_AllowProcessEvents;
  adapterCb.userdata1 = &adapterResult;
  adapterCb.callback = [](WGPURequestAdapterStatus status, WGPUAdapter adapter,
                          WGPUStringView message, void* userdata1, void*) {
    auto* result = static_cast<AdapterResult*>(userdata1);
    if (status == WGPURequestAdapterStatus_Success) {
      result->adapter = adapter;
    } else {
      std::fprintf(stderr, "requestAdapter: %.*s\n",
                   static_cast<int>(message.length), message.data);
    }
    result->done = true;
  };
  wgpuInstanceRequestAdapter(instance, &adapterOpts, adapterCb);
  pumpUntil(instance, adapterResult.done);
  if (!adapterResult.adapter) {
    std::fprintf(stderr, "nenhum adapter WebGPU disponível\n");
    return 1;
  }
  WGPUAdapter adapter = adapterResult.adapter;

  WGPUAdapterInfo info = WGPU_ADAPTER_INFO_INIT;
  wgpuAdapterGetInfo(adapter, &info);
  std::printf("adapter: %.*s (backend %d)\n",
              static_cast<int>(info.device.length), info.device.data,
              static_cast<int>(info.backendType));
  std::fflush(stdout);

  // ── Device ──
  DeviceResult deviceResult;
  WGPUDeviceDescriptor deviceDesc = WGPU_DEVICE_DESCRIPTOR_INIT;
  WGPURequestDeviceCallbackInfo deviceCb =
      WGPU_REQUEST_DEVICE_CALLBACK_INFO_INIT;
  deviceCb.mode = WGPUCallbackMode_AllowProcessEvents;
  deviceCb.userdata1 = &deviceResult;
  deviceCb.callback = [](WGPURequestDeviceStatus status, WGPUDevice device,
                         WGPUStringView message, void* userdata1, void*) {
    auto* result = static_cast<DeviceResult*>(userdata1);
    if (status == WGPURequestDeviceStatus_Success) {
      result->device = device;
    } else {
      std::fprintf(stderr, "requestDevice: %.*s\n",
                   static_cast<int>(message.length), message.data);
    }
    result->done = true;
  };
  wgpuAdapterRequestDevice(adapter, &deviceDesc, deviceCb);
  pumpUntil(instance, deviceResult.done);
  if (!deviceResult.device) {
    std::fprintf(stderr, "requestDevice falhou\n");
    return 1;
  }
  WGPUDevice device = deviceResult.device;
  WGPUQueue queue = wgpuDeviceGetQueue(device);

  // ── Configuração da surface ──
  WGPUSurfaceCapabilities caps = WGPU_SURFACE_CAPABILITIES_INIT;
  wgpuSurfaceGetCapabilities(surface, adapter, &caps);
  WGPUTextureFormat format =
      caps.formatCount > 0 ? caps.formats[0] : WGPUTextureFormat_BGRA8Unorm;

  int width = 0, height = 0;
  SDL_GetWindowSizeInPixels(window, &width, &height);

  WGPUSurfaceConfiguration config = WGPU_SURFACE_CONFIGURATION_INIT;
  config.device = device;
  config.format = format;
  config.width = static_cast<uint32_t>(width);
  config.height = static_cast<uint32_t>(height);
  config.presentMode = WGPUPresentMode_Fifo;
  wgpuSurfaceConfigure(surface, &config);

  // ── Hermes: runtime + print() + script de boot ──
  jsr_config jsConfig = nullptr;
  jsr_runtime jsRuntime = nullptr;
  napi_env env = nullptr;
  jsr_create_config(&jsConfig);
  jsr_create_runtime(jsConfig, &jsRuntime);
  jsr_delete_config(jsConfig);
  jsr_runtime_get_node_api_env(jsRuntime, &env);

  jsr_napi_env_scope envScope = nullptr;
  jsr_open_napi_env_scope(env, &envScope);

  napi_value global = nullptr;
  check(env, napi_get_global(env, &global), "napi_get_global");
  napi_value printFn = nullptr;
  check(env,
        napi_create_function(env, "print", NAPI_AUTO_LENGTH, jsPrint, nullptr,
                             &printFn),
        "napi_create_function(print)");
  check(env, napi_set_named_property(env, global, "print", printFn),
        "set global.print");

  napi_value bootSource = nullptr;
  check(env,
        napi_create_string_utf8(env, kBootScript, NAPI_AUTO_LENGTH,
                                &bootSource),
        "napi_create_string_utf8(boot)");
  napi_value bootResult = nullptr;
  check(env, jsr_run_script(env, bootSource, "boot.js", &bootResult),
        "jsr_run_script(boot.js)");

  // ── Loop principal: JS decide a cor, nativo renderiza e apresenta ──
  bool running = true;
  uint64_t frame = 0;
  double clearColor[3] = {0.05, 0.02, 0.10};
  while (running) {
    SDL_Event event;
    while (SDL_PollEvent(&event)) {
      if (event.type == SDL_EVENT_QUIT) running = false;
      if (event.type == SDL_EVENT_WINDOW_PIXEL_SIZE_CHANGED) {
        SDL_GetWindowSizeInPixels(window, &width, &height);
        if (width > 0 && height > 0) {
          config.width = static_cast<uint32_t>(width);
          config.height = static_cast<uint32_t>(height);
          wgpuSurfaceConfigure(surface, &config);
        }
      }
    }

    // tick(frame) no JS → [r, g, b]
    {
      napi_handle_scope handleScope = nullptr;
      napi_open_handle_scope(env, &handleScope);
      napi_value tickFn = nullptr;
      if (napi_get_named_property(env, global, "tick", &tickFn) == napi_ok) {
        napi_value frameArg = nullptr;
        napi_create_double(env, static_cast<double>(frame), &frameArg);
        napi_value color = nullptr;
        napi_status callStatus =
            napi_call_function(env, global, tickFn, 1, &frameArg, &color);
        if (callStatus == napi_ok) {
          for (uint32_t i = 0; i < 3; ++i) {
            napi_value channel = nullptr;
            if (napi_get_element(env, color, i, &channel) == napi_ok) {
              napi_get_value_double(env, channel, &clearColor[i]);
            }
          }
        } else {
          napiFail(env, callStatus, "tick()");
        }
      }
      bool hasMore = false;
      jsr_drain_microtasks(env, -1, &hasMore);
      napi_close_handle_scope(env, handleScope);
    }

    WGPUSurfaceTexture surfaceTexture = WGPU_SURFACE_TEXTURE_INIT;
    wgpuSurfaceGetCurrentTexture(surface, &surfaceTexture);
    if (surfaceTexture.status !=
            WGPUSurfaceGetCurrentTextureStatus_SuccessOptimal &&
        surfaceTexture.status !=
            WGPUSurfaceGetCurrentTextureStatus_SuccessSuboptimal) {
      if (surfaceTexture.texture) wgpuTextureRelease(surfaceTexture.texture);
      wgpuSurfaceConfigure(surface, &config);
      continue;
    }

    WGPUTextureView view =
        wgpuTextureCreateView(surfaceTexture.texture, nullptr);

    WGPURenderPassColorAttachment colorAtt =
        WGPU_RENDER_PASS_COLOR_ATTACHMENT_INIT;
    colorAtt.view = view;
    colorAtt.loadOp = WGPULoadOp_Clear;
    colorAtt.storeOp = WGPUStoreOp_Store;
    colorAtt.clearValue = {clearColor[0], clearColor[1], clearColor[2], 1.0};

    WGPURenderPassDescriptor passDesc = WGPU_RENDER_PASS_DESCRIPTOR_INIT;
    passDesc.colorAttachmentCount = 1;
    passDesc.colorAttachments = &colorAtt;

    WGPUCommandEncoder encoder =
        wgpuDeviceCreateCommandEncoder(device, nullptr);
    WGPURenderPassEncoder pass =
        wgpuCommandEncoderBeginRenderPass(encoder, &passDesc);
    wgpuRenderPassEncoderEnd(pass);
    wgpuRenderPassEncoderRelease(pass);

    WGPUCommandBuffer commands = wgpuCommandEncoderFinish(encoder, nullptr);
    wgpuCommandEncoderRelease(encoder);
    wgpuQueueSubmit(queue, 1, &commands);
    wgpuCommandBufferRelease(commands);

    wgpuSurfacePresent(surface);
    wgpuTextureViewRelease(view);
    wgpuTextureRelease(surfaceTexture.texture);
    ++frame;
  }

  jsr_close_napi_env_scope(env, envScope);
  jsr_delete_runtime(jsRuntime);

  wgpuSurfaceCapabilitiesFreeMembers(caps);
  wgpuQueueRelease(queue);
  wgpuDeviceRelease(device);
  wgpuAdapterRelease(adapter);
  wgpuSurfaceRelease(surface);
  wgpuInstanceRelease(instance);
  SDL_DestroyWindow(window);
  SDL_Quit();
  std::printf("cortex-native encerrou após %llu frames\n",
              static_cast<unsigned long long>(frame));
  return 0;
}
