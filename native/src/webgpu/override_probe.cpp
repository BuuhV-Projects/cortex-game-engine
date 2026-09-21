// Ver override_probe.h (SPEC-0238, passo 1).
#include "override_probe.h"

#include <webgpu/webgpu.h>
#include <webgpu/wgpu.h>

#include <cstdio>
#include <cstring>
#include <vector>

namespace webgpu {
namespace {

/** Alvo de 1x1: a sonda lê um pixel, não desenha cena. */
constexpr uint32_t kProbeSize = 1;
constexpr WGPUTextureFormat kProbeFormat = WGPUTextureFormat_RGBA8Unorm;
/** Alinhamento de linha exigido pelo copy de textura para buffer. */
constexpr uint32_t kBytesPerRowAlign = 256;
/** Valor que a constante de especialização deve produzir no canal vermelho. */
constexpr float kExpectedRed = 0.75f;
/** Tolerância da comparação, em passos de 8 bits. */
constexpr int kToleranceSteps = 2;

/**
 * O triângulo cobre o alvo inteiro; o fragmento devolve a cor que a constante
 * `uSelectedRed` escolher. Se o naga ignorar o `override`, o pixel sai com o
 * valor DEFAULT (0.0) e a sonda detecta.
 */
const char* kProbeShader = R"WGSL(
override uSelectedRed : f32 = 0.0;

@vertex
fn vs(@builtin(vertex_index) i : u32) -> @builtin(position) vec4f {
  var pos = array<vec2f, 3>(vec2f(-1.0, -3.0), vec2f(3.0, 1.0), vec2f(-1.0, 1.0));
  return vec4f(pos[i], 0.0, 1.0);
}

@fragment
fn fs() -> @location(0) vec4f {
  return vec4f(uSelectedRed, 0.0, 0.0, 1.0);
}
)WGSL";

struct AdapterResult {
  WGPUAdapter adapter = nullptr;
  bool done = false;
};
struct DeviceResult {
  WGPUDevice device = nullptr;
  bool done = false;
};
struct MapResult {
  bool done = false;
  WGPUMapAsyncStatus status = WGPUMapAsyncStatus_Error;
};

}  // namespace

bool runOverrideProbe() {
  WGPUInstance instance = wgpuCreateInstance(nullptr);
  if (!instance) {
    printf("[override-probe] sem instancia wgpu\n");
    return false;
  }

  AdapterResult adapterResult;
  WGPURequestAdapterOptions adapterOpts = WGPU_REQUEST_ADAPTER_OPTIONS_INIT;
  WGPURequestAdapterCallbackInfo adapterCb = WGPU_REQUEST_ADAPTER_CALLBACK_INFO_INIT;
  adapterCb.mode = WGPUCallbackMode_AllowProcessEvents;
  adapterCb.userdata1 = &adapterResult;
  adapterCb.callback = [](WGPURequestAdapterStatus status, WGPUAdapter adapter, WGPUStringView, void* ud1,
                          void*) {
    auto* r = static_cast<AdapterResult*>(ud1);
    if (status == WGPURequestAdapterStatus_Success) r->adapter = adapter;
    r->done = true;
  };
  wgpuInstanceRequestAdapter(instance, &adapterOpts, adapterCb);
  while (!adapterResult.done) wgpuInstanceProcessEvents(instance);
  if (!adapterResult.adapter) {
    printf("[override-probe] sem adapter\n");
    return false;
  }

  DeviceResult deviceResult;
  WGPUDeviceDescriptor deviceDesc = WGPU_DEVICE_DESCRIPTOR_INIT;
  WGPURequestDeviceCallbackInfo deviceCb = WGPU_REQUEST_DEVICE_CALLBACK_INFO_INIT;
  deviceCb.mode = WGPUCallbackMode_AllowProcessEvents;
  deviceCb.userdata1 = &deviceResult;
  deviceCb.callback = [](WGPURequestDeviceStatus status, WGPUDevice device, WGPUStringView, void* ud1,
                         void*) {
    auto* r = static_cast<DeviceResult*>(ud1);
    if (status == WGPURequestDeviceStatus_Success) r->device = device;
    r->done = true;
  };
  wgpuAdapterRequestDevice(adapterResult.adapter, &deviceDesc, deviceCb);
  while (!deviceResult.done) wgpuInstanceProcessEvents(instance);
  if (!deviceResult.device) {
    printf("[override-probe] sem device\n");
    return false;
  }
  WGPUDevice device = deviceResult.device;
  WGPUQueue queue = wgpuDeviceGetQueue(device);

  WGPUShaderSourceWGSL wgsl = WGPU_SHADER_SOURCE_WGSL_INIT;
  wgsl.code = {kProbeShader, WGPU_STRLEN};
  WGPUShaderModuleDescriptor smDesc = WGPU_SHADER_MODULE_DESCRIPTOR_INIT;
  smDesc.nextInChain = &wgsl.chain;
  WGPUShaderModule shader = wgpuDeviceCreateShaderModule(device, &smDesc);
  if (!shader) {
    printf("[override-probe] RESULTADO: shader com override NAO compilou\n");
    return false;
  }

  // O valor pedido pela constante de especialização. Se o naga ignorar isto, o
  // pixel sai com o default do shader (0.0) e a sonda acusa.
  WGPUConstantEntry constant = WGPU_CONSTANT_ENTRY_INIT;
  constant.key = {"uSelectedRed", WGPU_STRLEN};
  constant.value = kExpectedRed;

  WGPUColorTargetState colorTarget = WGPU_COLOR_TARGET_STATE_INIT;
  colorTarget.format = kProbeFormat;
  colorTarget.writeMask = WGPUColorWriteMask_All;
  WGPUFragmentState fragment = WGPU_FRAGMENT_STATE_INIT;
  fragment.module = shader;
  fragment.entryPoint = {"fs", WGPU_STRLEN};
  fragment.targetCount = 1;
  fragment.targets = &colorTarget;
  fragment.constantCount = 1;
  fragment.constants = &constant;

  WGPURenderPipelineDescriptor rpDesc = WGPU_RENDER_PIPELINE_DESCRIPTOR_INIT;
  rpDesc.vertex.module = shader;
  rpDesc.vertex.entryPoint = {"vs", WGPU_STRLEN};
  rpDesc.primitive.topology = WGPUPrimitiveTopology_TriangleList;
  rpDesc.multisample.count = 1;
  rpDesc.multisample.mask = 0xFFFFFFFF;
  rpDesc.fragment = &fragment;
  WGPURenderPipeline pipeline = wgpuDeviceCreateRenderPipeline(device, &rpDesc);
  if (!pipeline) {
    printf("[override-probe] RESULTADO: pipeline com override NAO foi criado\n");
    return false;
  }

  WGPUTextureDescriptor texDesc = WGPU_TEXTURE_DESCRIPTOR_INIT;
  texDesc.usage = WGPUTextureUsage_RenderAttachment | WGPUTextureUsage_CopySrc;
  texDesc.dimension = WGPUTextureDimension_2D;
  texDesc.size = {kProbeSize, kProbeSize, 1};
  texDesc.format = kProbeFormat;
  texDesc.mipLevelCount = 1;
  texDesc.sampleCount = 1;
  WGPUTexture target = wgpuDeviceCreateTexture(device, &texDesc);
  WGPUTextureView targetView = wgpuTextureCreateView(target, nullptr);

  WGPUBufferDescriptor readbackDesc = WGPU_BUFFER_DESCRIPTOR_INIT;
  readbackDesc.usage = WGPUBufferUsage_CopyDst | WGPUBufferUsage_MapRead;
  readbackDesc.size = kBytesPerRowAlign;
  WGPUBuffer readback = wgpuDeviceCreateBuffer(device, &readbackDesc);

  WGPUCommandEncoderDescriptor encDesc = WGPU_COMMAND_ENCODER_DESCRIPTOR_INIT;
  WGPUCommandEncoder encoder = wgpuDeviceCreateCommandEncoder(device, &encDesc);
  WGPURenderPassColorAttachment color = WGPU_RENDER_PASS_COLOR_ATTACHMENT_INIT;
  color.view = targetView;
  color.loadOp = WGPULoadOp_Clear;
  color.storeOp = WGPUStoreOp_Store;
  color.clearValue = {0.0, 0.0, 0.0, 1.0};
  WGPURenderPassDescriptor passDesc = WGPU_RENDER_PASS_DESCRIPTOR_INIT;
  passDesc.colorAttachmentCount = 1;
  passDesc.colorAttachments = &color;
  WGPURenderPassEncoder pass = wgpuCommandEncoderBeginRenderPass(encoder, &passDesc);
  wgpuRenderPassEncoderSetPipeline(pass, pipeline);
  wgpuRenderPassEncoderDraw(pass, 3, 1, 0, 0);
  wgpuRenderPassEncoderEnd(pass);
  wgpuRenderPassEncoderRelease(pass);

  WGPUTexelCopyTextureInfo src = WGPU_TEXEL_COPY_TEXTURE_INFO_INIT;
  src.texture = target;
  WGPUTexelCopyBufferInfo dst = WGPU_TEXEL_COPY_BUFFER_INFO_INIT;
  dst.buffer = readback;
  dst.layout.bytesPerRow = kBytesPerRowAlign;
  dst.layout.rowsPerImage = kProbeSize;
  WGPUExtent3D extent = {kProbeSize, kProbeSize, 1};
  wgpuCommandEncoderCopyTextureToBuffer(encoder, &src, &dst, &extent);

  WGPUCommandBufferDescriptor cbDesc = WGPU_COMMAND_BUFFER_DESCRIPTOR_INIT;
  WGPUCommandBuffer commands = wgpuCommandEncoderFinish(encoder, &cbDesc);
  wgpuQueueSubmit(queue, 1, &commands);
  wgpuCommandBufferRelease(commands);
  wgpuCommandEncoderRelease(encoder);

  MapResult mapResult;
  WGPUBufferMapCallbackInfo mapCb = WGPU_BUFFER_MAP_CALLBACK_INFO_INIT;
  mapCb.mode = WGPUCallbackMode_AllowProcessEvents;
  mapCb.userdata1 = &mapResult;
  mapCb.callback = [](WGPUMapAsyncStatus status, WGPUStringView, void* ud1, void*) {
    auto* r = static_cast<MapResult*>(ud1);
    r->status = status;
    r->done = true;
  };
  wgpuBufferMapAsync(readback, WGPUMapMode_Read, 0, kBytesPerRowAlign, mapCb);
  while (!mapResult.done) {
    wgpuDevicePoll(device, false, nullptr);
    wgpuInstanceProcessEvents(instance);
  }

  bool ok = false;
  if (mapResult.status == WGPUMapAsyncStatus_Success) {
    const auto* pixels = static_cast<const uint8_t*>(
        wgpuBufferGetConstMappedRange(readback, 0, kBytesPerRowAlign));
    if (pixels) {
      const int lido = static_cast<int>(pixels[0]);
      const int esperado = static_cast<int>(kExpectedRed * 255.0f + 0.5f);
      ok = (lido >= esperado - kToleranceSteps) && (lido <= esperado + kToleranceSteps);
      printf("[override-probe] vermelho lido=%d esperado=%d (default do shader seria 0)\n", lido,
             esperado);
      printf("[override-probe] RESULTADO: override %s no naga/D3D12\n",
             ok ? "FUNCIONA" : "NAO funciona (valor ignorado)");
    }
    wgpuBufferUnmap(readback);
  } else {
    printf("[override-probe] falha ao mapear o readback\n");
  }

  fflush(stdout);
  return ok;
}

}  // namespace webgpu
