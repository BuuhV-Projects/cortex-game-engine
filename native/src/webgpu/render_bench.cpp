// Ver render_bench.h (ADR-0232, fase 1).
#include "render_bench.h"

#include <webgpu/webgpu.h>
// `wgpuDevicePoll` é extensão do wgpu-native (não está no webgpu.h padrão).
#include <webgpu/wgpu.h>

#include <chrono>
#include <cmath>
#include <cstdio>
#include <vector>

namespace webgpu {
namespace {

// Alinhamento exigido pelo WebGPU para offset dinâmico de uniform buffer.
constexpr uint64_t kUniformAlign = 256;
// Uma matriz 4x4 de float — o que cada objeto manda para o shader.
constexpr uint64_t kMatrixBytes = 16 * sizeof(float);
// Alvo offscreen: o spike mede CPU, então o tamanho só precisa ser plausível.
constexpr uint32_t kTargetWidth = 1280;
constexpr uint32_t kTargetHeight = 720;
constexpr WGPUTextureFormat kTargetFormat = WGPUTextureFormat_BGRA8Unorm;
// Raio da esfera de recorte de cada objeto, em unidades de mundo.
constexpr float kBoundingRadius = 1.2f;
// Quantos planos tem um frustum.
constexpr int kFrustumPlanes = 6;
// Frames de aquecimento descartados (primeiro pipeline, primeira submissão).
constexpr int kWarmupFrames = 10;

const char* kBenchShader = R"WGSL(
@group(0) @binding(0) var<uniform> model : mat4x4f;

@vertex
fn vs(@location(0) pos : vec3f) -> @builtin(position) vec4f {
  return model * vec4f(pos, 1.0);
}

@fragment
fn fs() -> @location(0) vec4f {
  return vec4f(0.6, 0.7, 0.9, 1.0);
}
)WGSL";

/** Um objeto da cena do spike: transform próprio e matriz composta. */
struct BenchObject {
  float px, py, pz;
  float qx, qy, qz, qw;
  float sx, sy, sz;
  float world[16];
};

/** compose() do three: quaternion + posição + escala numa matriz 4x4. */
void compose(float* m, const BenchObject& o) {
  const float x2 = o.qx + o.qx, y2 = o.qy + o.qy, z2 = o.qz + o.qz;
  const float xx = o.qx * x2, xy = o.qx * y2, xz = o.qx * z2;
  const float yy = o.qy * y2, yz = o.qy * z2, zz = o.qz * z2;
  const float wx = o.qw * x2, wy = o.qw * y2, wz = o.qw * z2;
  m[0] = (1 - (yy + zz)) * o.sx;
  m[1] = (xy + wz) * o.sx;
  m[2] = (xz - wy) * o.sx;
  m[3] = 0;
  m[4] = (xy - wz) * o.sy;
  m[5] = (1 - (xx + zz)) * o.sy;
  m[6] = (yz + wx) * o.sy;
  m[7] = 0;
  m[8] = (xz + wy) * o.sz;
  m[9] = (yz - wx) * o.sz;
  m[10] = (1 - (xx + yy)) * o.sz;
  m[11] = 0;
  m[12] = o.px;
  m[13] = o.py;
  m[14] = o.pz;
  m[15] = 1;
}

/** multiplyMatrices() do three: out = a × b. */
void multiply(float* out, const float* a, const float* b) {
  for (int i = 0; i < 4; i++) {
    const float a0 = a[i], a1 = a[i + 4], a2 = a[i + 8], a3 = a[i + 12];
    out[i] = a0 * b[0] + a1 * b[1] + a2 * b[2] + a3 * b[3];
    out[i + 4] = a0 * b[4] + a1 * b[5] + a2 * b[6] + a3 * b[7];
    out[i + 8] = a0 * b[8] + a1 * b[9] + a2 * b[10] + a3 * b[11];
    out[i + 12] = a0 * b[12] + a1 * b[13] + a2 * b[14] + a3 * b[15];
  }
}

/** intersectsSphere() do frustum: 6 planos contra o centro do objeto. */
bool insideFrustum(const float* planes, float x, float y, float z, float radius) {
  for (int i = 0; i < kFrustumPlanes; i++) {
    const int p = i * 4;
    const float d = planes[p] * x + planes[p + 1] * y + planes[p + 2] * z + planes[p + 3];
    if (d < -radius) return false;
  }
  return true;
}

/** Espera um pedido assíncrono do wgpu (o padrão suportado na v29). */
struct AdapterResult {
  WGPUAdapter adapter = nullptr;
  bool done = false;
};
struct DeviceResult {
  WGPUDevice device = nullptr;
  bool done = false;
};

}  // namespace

bool runRenderBench(int objetos, int frames) {
  WGPUInstance instance = wgpuCreateInstance(nullptr);
  if (!instance) {
    printf("[render-bench] sem instancia wgpu\n");
    return false;
  }

  AdapterResult adapterResult;
  WGPURequestAdapterOptions adapterOpts = WGPU_REQUEST_ADAPTER_OPTIONS_INIT;
  WGPURequestAdapterCallbackInfo adapterCb = WGPU_REQUEST_ADAPTER_CALLBACK_INFO_INIT;
  adapterCb.mode = WGPUCallbackMode_AllowProcessEvents;
  adapterCb.userdata1 = &adapterResult;
  adapterCb.callback = [](WGPURequestAdapterStatus status, WGPUAdapter adapter,
                          WGPUStringView, void* ud1, void*) {
    auto* r = static_cast<AdapterResult*>(ud1);
    if (status == WGPURequestAdapterStatus_Success) r->adapter = adapter;
    r->done = true;
  };
  wgpuInstanceRequestAdapter(instance, &adapterOpts, adapterCb);
  while (!adapterResult.done) wgpuInstanceProcessEvents(instance);
  if (!adapterResult.adapter) {
    printf("[render-bench] sem adapter\n");
    return false;
  }

  DeviceResult deviceResult;
  WGPUDeviceDescriptor deviceDesc = WGPU_DEVICE_DESCRIPTOR_INIT;
  WGPURequestDeviceCallbackInfo deviceCb = WGPU_REQUEST_DEVICE_CALLBACK_INFO_INIT;
  deviceCb.mode = WGPUCallbackMode_AllowProcessEvents;
  deviceCb.userdata1 = &deviceResult;
  deviceCb.callback = [](WGPURequestDeviceStatus status, WGPUDevice device,
                         WGPUStringView, void* ud1, void*) {
    auto* r = static_cast<DeviceResult*>(ud1);
    if (status == WGPURequestDeviceStatus_Success) r->device = device;
    r->done = true;
  };
  wgpuAdapterRequestDevice(adapterResult.adapter, &deviceDesc, deviceCb);
  while (!deviceResult.done) wgpuInstanceProcessEvents(instance);
  if (!deviceResult.device) {
    printf("[render-bench] sem device\n");
    return false;
  }
  WGPUDevice device = deviceResult.device;
  WGPUQueue queue = wgpuDeviceGetQueue(device);

  // ── Alvo offscreen ────────────────────────────────────────────────────────
  WGPUTextureDescriptor targetDesc = WGPU_TEXTURE_DESCRIPTOR_INIT;
  targetDesc.usage = WGPUTextureUsage_RenderAttachment;
  targetDesc.dimension = WGPUTextureDimension_2D;
  targetDesc.size = {kTargetWidth, kTargetHeight, 1};
  targetDesc.format = kTargetFormat;
  targetDesc.mipLevelCount = 1;
  targetDesc.sampleCount = 1;
  WGPUTexture target = wgpuDeviceCreateTexture(device, &targetDesc);
  WGPUTextureView targetView = wgpuTextureCreateView(target, nullptr);

  // ── Geometria: um triângulo por objeto (o custo medido é o do LAÇO) ───────
  const float vertices[] = {-0.5f, -0.5f, 0.0f, 0.5f, -0.5f, 0.0f, 0.0f, 0.5f, 0.0f};
  WGPUBufferDescriptor vbDesc = WGPU_BUFFER_DESCRIPTOR_INIT;
  vbDesc.usage = WGPUBufferUsage_Vertex | WGPUBufferUsage_CopyDst;
  vbDesc.size = sizeof(vertices);
  WGPUBuffer vertexBuffer = wgpuDeviceCreateBuffer(device, &vbDesc);
  wgpuQueueWriteBuffer(queue, vertexBuffer, 0, vertices, sizeof(vertices));

  // ── Uniforme por objeto, num buffer só com offset dinâmico ────────────────
  // É a prática nativa: um bind group, um offset por objeto. O `three` cria um
  // bind group por objeto, e parte dos 33,5 us está justamente aí.
  const uint64_t uniformStride = kUniformAlign;
  WGPUBufferDescriptor ubDesc = WGPU_BUFFER_DESCRIPTOR_INIT;
  ubDesc.usage = WGPUBufferUsage_Uniform | WGPUBufferUsage_CopyDst;
  ubDesc.size = uniformStride * static_cast<uint64_t>(objetos);
  WGPUBuffer uniformBuffer = wgpuDeviceCreateBuffer(device, &ubDesc);

  WGPUBindGroupLayoutEntry bglEntry = WGPU_BIND_GROUP_LAYOUT_ENTRY_INIT;
  bglEntry.binding = 0;
  bglEntry.visibility = WGPUShaderStage_Vertex;
  bglEntry.buffer.type = WGPUBufferBindingType_Uniform;
  bglEntry.buffer.hasDynamicOffset = true;
  bglEntry.buffer.minBindingSize = kMatrixBytes;
  WGPUBindGroupLayoutDescriptor bglDesc = WGPU_BIND_GROUP_LAYOUT_DESCRIPTOR_INIT;
  bglDesc.entryCount = 1;
  bglDesc.entries = &bglEntry;
  WGPUBindGroupLayout bgl = wgpuDeviceCreateBindGroupLayout(device, &bglDesc);

  WGPUBindGroupEntry bgEntry = WGPU_BIND_GROUP_ENTRY_INIT;
  bgEntry.binding = 0;
  bgEntry.buffer = uniformBuffer;
  bgEntry.offset = 0;
  bgEntry.size = kMatrixBytes;
  WGPUBindGroupDescriptor bgDesc = WGPU_BIND_GROUP_DESCRIPTOR_INIT;
  bgDesc.layout = bgl;
  bgDesc.entryCount = 1;
  bgDesc.entries = &bgEntry;
  WGPUBindGroup bindGroup = wgpuDeviceCreateBindGroup(device, &bgDesc);

  WGPUPipelineLayoutDescriptor plDesc = WGPU_PIPELINE_LAYOUT_DESCRIPTOR_INIT;
  plDesc.bindGroupLayoutCount = 1;
  plDesc.bindGroupLayouts = &bgl;
  WGPUPipelineLayout pipelineLayout = wgpuDeviceCreatePipelineLayout(device, &plDesc);

  WGPUShaderSourceWGSL wgsl = WGPU_SHADER_SOURCE_WGSL_INIT;
  wgsl.code = {kBenchShader, WGPU_STRLEN};
  WGPUShaderModuleDescriptor smDesc = WGPU_SHADER_MODULE_DESCRIPTOR_INIT;
  smDesc.nextInChain = &wgsl.chain;
  WGPUShaderModule shader = wgpuDeviceCreateShaderModule(device, &smDesc);

  WGPUVertexAttribute attr = WGPU_VERTEX_ATTRIBUTE_INIT;
  attr.format = WGPUVertexFormat_Float32x3;
  attr.offset = 0;
  attr.shaderLocation = 0;
  WGPUVertexBufferLayout vbLayout = WGPU_VERTEX_BUFFER_LAYOUT_INIT;
  vbLayout.arrayStride = 3 * sizeof(float);
  vbLayout.attributeCount = 1;
  vbLayout.attributes = &attr;

  WGPUColorTargetState colorTarget = WGPU_COLOR_TARGET_STATE_INIT;
  colorTarget.format = kTargetFormat;
  colorTarget.writeMask = WGPUColorWriteMask_All;
  WGPUFragmentState fragment = WGPU_FRAGMENT_STATE_INIT;
  fragment.module = shader;
  fragment.entryPoint = {"fs", WGPU_STRLEN};
  fragment.targetCount = 1;
  fragment.targets = &colorTarget;

  WGPURenderPipelineDescriptor rpDesc = WGPU_RENDER_PIPELINE_DESCRIPTOR_INIT;
  rpDesc.layout = pipelineLayout;
  rpDesc.vertex.module = shader;
  rpDesc.vertex.entryPoint = {"vs", WGPU_STRLEN};
  rpDesc.vertex.bufferCount = 1;
  rpDesc.vertex.buffers = &vbLayout;
  rpDesc.primitive.topology = WGPUPrimitiveTopology_TriangleList;
  rpDesc.multisample.count = 1;
  rpDesc.multisample.mask = 0xFFFFFFFF;
  rpDesc.fragment = &fragment;
  WGPURenderPipeline pipeline = wgpuDeviceCreateRenderPipeline(device, &rpDesc);
  if (!pipeline) {
    printf("[render-bench] pipeline falhou\n");
    return false;
  }

  // ── Cena ──────────────────────────────────────────────────────────────────
  std::vector<BenchObject> cena(static_cast<size_t>(objetos));
  for (int i = 0; i < objetos; i++) {
    BenchObject& o = cena[static_cast<size_t>(i)];
    o.px = static_cast<float>(i) * 0.01f;
    o.py = static_cast<float>(i) * 0.02f;
    o.pz = static_cast<float>(i) * 0.03f;
    o.qx = 0.1f; o.qy = 0.2f; o.qz = 0.3f; o.qw = 0.927f;
    o.sx = 1.0f; o.sy = 1.0f; o.sz = 1.0f;
  }
  float viewProj[16];
  BenchObject camera{};
  camera.qw = 1.0f;
  camera.sx = camera.sy = camera.sz = 1.0f;
  compose(viewProj, camera);
  float planes[kFrustumPlanes * 4];
  for (int i = 0; i < kFrustumPlanes; i++) {
    planes[i * 4] = 0.5f;
    planes[i * 4 + 1] = 0.5f;
    planes[i * 4 + 2] = 0.5f;
    planes[i * 4 + 3] = 200.0f;
  }

  // ── Laço medido ───────────────────────────────────────────────────────────
  using Relogio = std::chrono::steady_clock;
  double loopNanos = 0;
  long long desenhados = 0;
  std::vector<float> staging(static_cast<size_t>(objetos) * 16);

  for (int frame = 0; frame < frames + kWarmupFrames; frame++) {
    const bool medindo = frame >= kWarmupFrames;
    const auto inicio = Relogio::now();

    WGPUCommandEncoderDescriptor encDesc = WGPU_COMMAND_ENCODER_DESCRIPTOR_INIT;
    WGPUCommandEncoder encoder = wgpuDeviceCreateCommandEncoder(device, &encDesc);
    WGPURenderPassColorAttachment color = WGPU_RENDER_PASS_COLOR_ATTACHMENT_INIT;
    color.view = targetView;
    color.loadOp = WGPULoadOp_Clear;
    color.storeOp = WGPUStoreOp_Store;
    color.clearValue = {0.05, 0.05, 0.07, 1.0};
    WGPURenderPassDescriptor passDesc = WGPU_RENDER_PASS_DESCRIPTOR_INIT;
    passDesc.colorAttachmentCount = 1;
    passDesc.colorAttachments = &color;
    WGPURenderPassEncoder pass = wgpuCommandEncoderBeginRenderPass(encoder, &passDesc);
    wgpuRenderPassEncoderSetPipeline(pass, pipeline);
    wgpuRenderPassEncoderSetVertexBuffer(pass, 0, vertexBuffer, 0, WGPU_WHOLE_SIZE);

    int visiveis = 0;
    for (int i = 0; i < objetos; i++) {
      BenchObject& o = cena[static_cast<size_t>(i)];
      float local[16];
      compose(local, o);
      multiply(o.world, viewProj, local);
      if (!insideFrustum(planes, o.world[12], o.world[13], o.world[14], kBoundingRadius)) continue;
      for (int k = 0; k < 16; k++) staging[static_cast<size_t>(visiveis) * 16 + static_cast<size_t>(k)] = o.world[k];
      const uint32_t offset = static_cast<uint32_t>(uniformStride * static_cast<uint64_t>(visiveis));
      wgpuQueueWriteBuffer(queue, uniformBuffer, offset, o.world, kMatrixBytes);
      wgpuRenderPassEncoderSetBindGroup(pass, 0, bindGroup, 1, &offset);
      wgpuRenderPassEncoderDraw(pass, 3, 1, 0, 0);
      visiveis++;
    }

    wgpuRenderPassEncoderEnd(pass);
    wgpuRenderPassEncoderRelease(pass);
    WGPUCommandBufferDescriptor cbDesc = WGPU_COMMAND_BUFFER_DESCRIPTOR_INIT;
    WGPUCommandBuffer commands = wgpuCommandEncoderFinish(encoder, &cbDesc);
    wgpuQueueSubmit(queue, 1, &commands);
    wgpuCommandBufferRelease(commands);
    wgpuCommandEncoderRelease(encoder);
    wgpuDevicePoll(device, false, nullptr);

    if (medindo) {
      loopNanos += std::chrono::duration<double, std::nano>(Relogio::now() - inicio).count();
      desenhados += visiveis;
    }
  }

  const double porDraw = desenhados > 0 ? loopNanos / static_cast<double>(desenhados) / 1000.0 : 0;
  const double porFrame = loopNanos / static_cast<double>(frames) / 1e6;
  printf("[render-bench] objetos=%d frames=%d draws_por_frame=%lld us_por_draw=%.3f ms_por_frame=%.3f\n",
         objetos, frames, desenhados / frames, porDraw, porFrame);
  printf("[render-bench] referencia JS no mesmo host (SPEC-0227): 33.5 us_por_draw\n");
  fflush(stdout);
  return true;
}

}  // namespace webgpu
