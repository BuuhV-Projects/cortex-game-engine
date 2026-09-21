// Ver dual_pass_spike.h (SPEC-0241, passo 0).
#include "dual_pass_spike.h"

#include "../core/host_gpu.h"

#include <webgpu/wgpu.h>

#include <cstdio>
#include <cstring>
#include <string>

namespace webgpu {
namespace {

/** Cor do marcador: magenta saturado, que não existe na cena do jogo. */
constexpr float kMarcadorR = 1.0f;
constexpr float kMarcadorG = 0.0f;
constexpr float kMarcadorB = 1.0f;
constexpr float kMarcadorA = 1.0f;

/** Alinhamento de linha exigido no copy de textura para buffer. */
constexpr uint32_t kBytesPerRowAlign = 256;
/** Um pixel RGBA de meia precisão ocupa 8 bytes. */
constexpr uint32_t kBytesPorPixelMeiaPrecisao = 8;
constexpr uint32_t kCanaisRgba = 4;

/**
 * O marcador cobre só o MIOLO da tela: sobra borda para servir de controle
 * (pixel que o C++ nunca tocou e que precisa continuar sendo do `three`).
 */
const char* kSpikeShader = R"WGSL(
@vertex
fn vs(@builtin(vertex_index) i : u32) -> @builtin(position) vec4f {
  var pos = array<vec2f, 3>(vec2f(-0.4, -0.4), vec2f(0.4, -0.4), vec2f(0.0, 0.5));
  // z = 0.5 em NDC; quem decide a profundidade real e o viewport
  // (minDepth == maxDepth), sem precisar de uniforme.
  return vec4f(pos[i], 0.5, 1.0);
}

@fragment
fn fs() -> @location(0) vec4f {
  return vec4f(MARCADOR);
}
)WGSL";

struct MapResult {
  bool done = false;
  WGPUMapAsyncStatus status = WGPUMapAsyncStatus_Error;
};

void aoMapear(WGPUMapAsyncStatus status, WGPUStringView, void* ud, void*) {
  auto* r = static_cast<MapResult*>(ud);
  r->status = status;
  r->done = true;
}

/** Converte meia precisão (16 bits) para float — só o suficiente para a sonda. */
float deMeiaPrecisao(uint16_t h) {
  const uint32_t sinal = static_cast<uint32_t>(h & 0x8000u) << 16;
  const uint32_t expo = (h >> 10) & 0x1Fu;
  const uint32_t mantissa = h & 0x3FFu;
  uint32_t bits = 0;
  if (expo == 0) {
    // Subnormal ou zero: para o que a sonda mede, tratar como zero basta.
    bits = sinal;
  } else if (expo == 0x1Fu) {
    bits = sinal | 0x7F800000u | (mantissa << 13);  // infinito / NaN
  } else {
    bits = sinal | ((expo + 112u) << 23) | (mantissa << 13);
  }
  float f = 0.0f;
  std::memcpy(&f, &bits, sizeof(f));
  return f;
}

/** Maior valor de um canal de 8 bits, para normalizar em 0..1. */
constexpr float kMaxCanal8Bits = 255.0f;

/**
 * Converte o pixel lido para 0..1 conforme o formato do alvo. Devolve `false`
 * quando o formato não é um dos que a sonda entende — melhor recusar do que
 * relatar cor errada.
 */
bool converterPixel(WGPUTextureFormat formato, const void* bytes, float canaisOut[4]) {
  switch (formato) {
    case WGPUTextureFormat_RGBA16Float: {
      uint16_t meia[kCanaisRgba];
      std::memcpy(meia, bytes, kBytesPorPixelMeiaPrecisao);
      for (uint32_t c = 0; c < kCanaisRgba; ++c) canaisOut[c] = deMeiaPrecisao(meia[c]);
      return true;
    }
    case WGPUTextureFormat_RGBA8Unorm:
    case WGPUTextureFormat_RGBA8UnormSrgb: {
      uint8_t v[kCanaisRgba];
      std::memcpy(v, bytes, kCanaisRgba);
      for (uint32_t c = 0; c < kCanaisRgba; ++c) canaisOut[c] = v[c] / kMaxCanal8Bits;
      return true;
    }
    case WGPUTextureFormat_BGRA8Unorm:
    case WGPUTextureFormat_BGRA8UnormSrgb: {
      uint8_t v[kCanaisRgba];
      std::memcpy(v, bytes, kCanaisRgba);
      canaisOut[0] = v[2] / kMaxCanal8Bits;  // R vem depois do B neste formato
      canaisOut[1] = v[1] / kMaxCanal8Bits;
      canaisOut[2] = v[0] / kMaxCanal8Bits;
      canaisOut[3] = v[3] / kMaxCanal8Bits;
      return true;
    }
    default:
      return false;
  }
}

/**
 * Pipeline do marcador, criado uma vez por combinação de formatos. O spike não
 * mede custo de criação, mas recriar por frame poluiria o teste de estabilidade
 * (o que se quer ver é a imagem não degradar entre o primeiro frame e o último).
 */
struct PipelineDoMarcador {
  WGPURenderPipeline pipeline = nullptr;
  WGPUTextureFormat formatoCor = WGPUTextureFormat_Undefined;
  WGPUTextureFormat formatoProfundidade = WGPUTextureFormat_Undefined;
  uint32_t amostras = 0;
};

PipelineDoMarcador& pipelineCache() {
  static PipelineDoMarcador instancia;
  return instancia;
}

std::string montarFonte() {
  char marcador[128];
  std::snprintf(marcador, sizeof(marcador), "%.1f, %.1f, %.1f, %.1f", kMarcadorR,
                kMarcadorG, kMarcadorB, kMarcadorA);
  std::string fonte = kSpikeShader;
  const std::string alvo = "MARCADOR";
  const size_t onde = fonte.find(alvo);
  if (onde != std::string::npos) fonte.replace(onde, alvo.size(), marcador);
  return fonte;
}

WGPURenderPipeline obterPipeline(HostGpu* gpu, WGPUTextureFormat formatoCor,
                                 WGPUTextureFormat formatoProfundidade,
                                 uint32_t amostras) {
  PipelineDoMarcador& cache = pipelineCache();
  if (cache.pipeline && cache.formatoCor == formatoCor &&
      cache.formatoProfundidade == formatoProfundidade &&
      cache.amostras == amostras) {
    return cache.pipeline;
  }
  if (cache.pipeline) {
    wgpuRenderPipelineRelease(cache.pipeline);
    cache.pipeline = nullptr;
  }

  const std::string fonte = montarFonte();
  WGPUShaderSourceWGSL wgsl = WGPU_SHADER_SOURCE_WGSL_INIT;
  wgsl.code = WGPUStringView{fonte.c_str(), fonte.size()};
  WGPUShaderModuleDescriptor sd = WGPU_SHADER_MODULE_DESCRIPTOR_INIT;
  sd.nextInChain = &wgsl.chain;
  WGPUShaderModule modulo = wgpuDeviceCreateShaderModule(gpu->device, &sd);
  if (!modulo) return nullptr;

  WGPUColorTargetState alvo = WGPU_COLOR_TARGET_STATE_INIT;
  alvo.format = formatoCor;
  alvo.writeMask = WGPUColorWriteMask_All;

  WGPUFragmentState fs = WGPU_FRAGMENT_STATE_INIT;
  fs.module = modulo;
  fs.entryPoint = WGPUStringView{"fs", 2};
  fs.targetCount = 1;
  fs.targets = &alvo;

  // Menor OU igual, e escrevendo profundidade: é o que permite ao `three`, na
  // pass seguinte, decidir corretamente quem fica na frente.
  WGPUDepthStencilState ds = WGPU_DEPTH_STENCIL_STATE_INIT;
  ds.format = formatoProfundidade;
  ds.depthWriteEnabled = WGPUOptionalBool_True;
  ds.depthCompare = WGPUCompareFunction_LessEqual;

  WGPURenderPipelineDescriptor pd = WGPU_RENDER_PIPELINE_DESCRIPTOR_INIT;
  pd.vertex.module = modulo;
  pd.vertex.entryPoint = WGPUStringView{"vs", 2};
  pd.primitive.topology = WGPUPrimitiveTopology_TriangleList;
  pd.fragment = &fs;
  pd.depthStencil = &ds;
  // Tem de casar com o alvo: o `three` desenha com antialias, num alvo
  // multiamostra. Pipeline com contagem diferente da textura é erro de
  // validacao, nao aviso.
  pd.multisample.count = amostras;

  cache.pipeline = wgpuDeviceCreateRenderPipeline(gpu->device, &pd);
  cache.formatoCor = formatoCor;
  cache.formatoProfundidade = formatoProfundidade;
  cache.amostras = amostras;
  wgpuShaderModuleRelease(modulo);
  return cache.pipeline;
}

}  // namespace

bool spikeDrawMarker(HostGpu* gpu, WGPUTexture alvoCor, WGPUTexture alvoProfundidade,
                     float profundidadeNdc, bool limpar) {
  if (!gpu || !gpu->device || !gpu->queue || !alvoProfundidade) return false;
  // Sem alvo explícito, o alvo é o offscreen do host — que é exatamente onde o
  // `three` desenha quando renderiza na canvas (SSAA). É o caso do jogo que não
  // usa pós-processamento, e o que mais interessa provar.
  if (!alvoCor) alvoCor = gpu->offscreenTexture;
  if (!alvoCor) return false;

  const WGPUTextureFormat formatoCor = wgpuTextureGetFormat(alvoCor);
  const WGPUTextureFormat formatoProfundidade = wgpuTextureGetFormat(alvoProfundidade);
  const uint32_t amostras = wgpuTextureGetSampleCount(alvoCor);
  WGPURenderPipeline pipeline =
      obterPipeline(gpu, formatoCor, formatoProfundidade, amostras);
  if (!pipeline) {
    std::fprintf(stderr, "[spike-m5] nao consegui criar o pipeline do marcador\n");
    return false;
  }

  WGPUTextureView viewCor = wgpuTextureCreateView(alvoCor, nullptr);
  WGPUTextureView viewProfundidade = wgpuTextureCreateView(alvoProfundidade, nullptr);

  WGPURenderPassColorAttachment cor = WGPU_RENDER_PASS_COLOR_ATTACHMENT_INIT;
  cor.view = viewCor;
  cor.loadOp = limpar ? WGPULoadOp_Clear : WGPULoadOp_Load;
  cor.storeOp = WGPUStoreOp_Store;
  cor.clearValue = WGPUColor{0.0, 0.0, 0.0, 1.0};

  WGPURenderPassDepthStencilAttachment prof = WGPU_RENDER_PASS_DEPTH_STENCIL_ATTACHMENT_INIT;
  prof.view = viewProfundidade;
  prof.depthLoadOp = limpar ? WGPULoadOp_Clear : WGPULoadOp_Load;
  prof.depthStoreOp = WGPUStoreOp_Store;
  prof.depthClearValue = 1.0f;

  WGPURenderPassDescriptor rp = WGPU_RENDER_PASS_DESCRIPTOR_INIT;
  rp.colorAttachmentCount = 1;
  rp.colorAttachments = &cor;
  rp.depthStencilAttachment = &prof;

  // Uma vez só: descreve o alvo que o marcador encontrou. É o dado que diz se
  // o C++ está mesmo desenhando onde o `three` desenha.
  static bool alvoRelatado = false;
  if (!alvoRelatado) {
    alvoRelatado = true;
    std::fprintf(stderr,
                 "[spike-m5] marcador: cor=%d prof=%d amostras=%u alvo=%ux%u ndc=%.1f\n",
                 static_cast<int>(formatoCor), static_cast<int>(formatoProfundidade),
                 amostras, wgpuTextureGetWidth(alvoCor), wgpuTextureGetHeight(alvoCor),
                 profundidadeNdc);
    std::fflush(stderr);
  }

  WGPUCommandEncoderDescriptor ed = WGPU_COMMAND_ENCODER_DESCRIPTOR_INIT;
  WGPUCommandEncoder encoder = wgpuDeviceCreateCommandEncoder(gpu->device, &ed);
  WGPURenderPassEncoder pass = wgpuCommandEncoderBeginRenderPass(encoder, &rp);

  const float largura = static_cast<float>(wgpuTextureGetWidth(alvoCor));
  const float altura = static_cast<float>(wgpuTextureGetHeight(alvoCor));
  // minDepth == maxDepth: todo fragmento sai exatamente nesta profundidade.
  wgpuRenderPassEncoderSetViewport(pass, 0.0f, 0.0f, largura, altura,
                                   profundidadeNdc, profundidadeNdc);
  wgpuRenderPassEncoderSetPipeline(pass, pipeline);
  wgpuRenderPassEncoderDraw(pass, 3, 1, 0, 0);
  wgpuRenderPassEncoderEnd(pass);
  wgpuRenderPassEncoderRelease(pass);

  WGPUCommandBufferDescriptor cd = WGPU_COMMAND_BUFFER_DESCRIPTOR_INIT;
  WGPUCommandBuffer cmd = wgpuCommandEncoderFinish(encoder, &cd);
  wgpuQueueSubmit(gpu->queue, 1, &cmd);
  wgpuCommandBufferRelease(cmd);
  wgpuCommandEncoderRelease(encoder);
  wgpuTextureViewRelease(viewCor);
  wgpuTextureViewRelease(viewProfundidade);
  return true;
}

bool spikeReadPixel(HostGpu* gpu, WGPUTexture alvoCor, uint32_t x, uint32_t y,
                    float canaisOut[4]) {
  if (!gpu || !gpu->device || !gpu->queue || !canaisOut) return false;
  if (!alvoCor) alvoCor = gpu->offscreenTexture;
  if (!alvoCor) return false;

  WGPUBufferDescriptor bd = WGPU_BUFFER_DESCRIPTOR_INIT;
  bd.size = kBytesPerRowAlign;
  bd.usage = WGPUBufferUsage_CopyDst | WGPUBufferUsage_MapRead;
  WGPUBuffer leitura = wgpuDeviceCreateBuffer(gpu->device, &bd);
  if (!leitura) return false;

  const WGPUTextureFormat formato = wgpuTextureGetFormat(alvoCor);

  WGPUTexelCopyTextureInfo origem = WGPU_TEXEL_COPY_TEXTURE_INFO_INIT;
  origem.texture = alvoCor;
  origem.origin = WGPUOrigin3D{x, y, 0};

  WGPUTexelCopyBufferInfo destino = WGPU_TEXEL_COPY_BUFFER_INFO_INIT;
  destino.buffer = leitura;
  destino.layout.bytesPerRow = kBytesPerRowAlign;
  destino.layout.rowsPerImage = 1;

  WGPUExtent3D extensao{1, 1, 1};

  WGPUCommandEncoderDescriptor ed = WGPU_COMMAND_ENCODER_DESCRIPTOR_INIT;
  WGPUCommandEncoder encoder = wgpuDeviceCreateCommandEncoder(gpu->device, &ed);
  wgpuCommandEncoderCopyTextureToBuffer(encoder, &origem, &destino, &extensao);
  WGPUCommandBufferDescriptor cd = WGPU_COMMAND_BUFFER_DESCRIPTOR_INIT;
  WGPUCommandBuffer cmd = wgpuCommandEncoderFinish(encoder, &cd);
  wgpuQueueSubmit(gpu->queue, 1, &cmd);
  wgpuCommandBufferRelease(cmd);
  wgpuCommandEncoderRelease(encoder);

  MapResult resultado;
  WGPUBufferMapCallbackInfo ci = WGPU_BUFFER_MAP_CALLBACK_INFO_INIT;
  ci.mode = WGPUCallbackMode_AllowProcessEvents;
  ci.callback = aoMapear;
  ci.userdata1 = &resultado;
  wgpuBufferMapAsync(leitura, WGPUMapMode_Read, 0, kBytesPerRowAlign, ci);
  while (!resultado.done) {
    wgpuDevicePoll(gpu->device, 0, nullptr);
    wgpuInstanceProcessEvents(gpu->instance);
  }

  bool ok = false;
  if (resultado.status == WGPUMapAsyncStatus_Success) {
    const void* bytes =
        wgpuBufferGetConstMappedRange(leitura, 0, kBytesPerRowAlign);
    if (bytes) {
      // O alvo muda conforme o caminho: o HDR do pós-processamento é meia
      // precisão, e o offscreen do SSAA é de 8 bits por canal (e pode vir com
      // a ordem BGRA). Ler sem olhar o formato daria cor trocada — e um spike
      // que mente sobre cor não decide nada.
      ok = converterPixel(formato, bytes, canaisOut);
      if (!ok) {
        std::fprintf(stderr, "[spike-m5] formato de textura nao suportado pela sonda: %d\n",
                     static_cast<int>(formato));
      }
    }
    wgpuBufferUnmap(leitura);
  }
  wgpuBufferRelease(leitura);
  return ok;
}

}  // namespace webgpu
