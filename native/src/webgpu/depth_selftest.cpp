// Ver depth_selftest.h — autoteste da premissa de profundidade do ADR-0237.
//
// ── O QUE O TESTE MEDE ──────────────────────────────────────────────────────
// Três cenários, cada um com texturas próprias (256x256), sem nada do `three`:
//
//   [base]     só a pass A: triângulo de tela cheia em z = 0.5, VERMELHO,
//              depthCompare = Always, depthWriteEnabled = true, cor e
//              profundidade com Clear e storeOp = Store. Submetida sozinha.
//              Serve de sanidade: prova que o desenho acontece.
//
//   [oclusao]  pass A (igual à de cima) e depois, num command encoder NOVO e
//              num submit NOVO, a pass B: mesmo triângulo em z = 0.9, VERDE,
//              depthCompare = LessEqual, depthWriteEnabled = false, cor com
//              Load e profundidade com **Load**. 0.9 NÃO é <= 0.5, então a
//              pass B tem de ser rejeitada pelo teste de profundidade.
//
//   [controle] idêntico ao [oclusao], mas com a pass B em z = 0.1, que É <= 0.5
//              e portanto DEVE passar. Existe para provar que o instrumento não
//              está dando vermelho por outro motivo (pipeline quebrado, pass B
//              nunca executada, cor errada). Sem este caso, o resultado do
//              [oclusao] não significa nada.
//
// ── COMO LER O RESULTADO ────────────────────────────────────────────────────
// Pixel central do cenário [oclusao]:
//
//   VERMELHO → a pass B foi corretamente rejeitada pelo teste de profundidade
//              (0.9 > 0.5) ⇒ a profundidade escrita pela pass A PERSISTIU entre
//              command buffers e foi lida pela pass B ⇒ **a premissa do
//              ADR-0237 vale**.
//
//   VERDE    → a pass B passou no teste ⇒ a pass B enxergou a profundidade como
//              se estivesse vazia (zeros/limpa), NÃO viu o que a pass A escreveu
//              ⇒ **a premissa do ADR-0237 NÃO vale** neste caminho wgpu/D3D12, e
//              o desenho do marco precisa mudar (uma pass só, ou re-escrita da
//              profundidade, ou depth prepass no mesmo command buffer).
//
// E o cenário [controle] tem de dar VERDE. Se não der, o instrumento está
// quebrado e o veredito do [oclusao] é INVÁLIDO — o teste diz isso na cara.
#include "depth_selftest.h"

#include "../core/host_gpu.h"

#include <webgpu/webgpu.h>
#include <webgpu/wgpu.h>

#include <cstdarg>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>

namespace webgpu {
namespace {

// ── Constantes do experimento (sem número mágico solto no meio do código) ───

/** Lado da textura de teste. 256 já é o alinhamento de linha do copy. */
constexpr uint32_t kLado = 256;
constexpr WGPUTextureFormat kFormatoCor = WGPUTextureFormat_RGBA8Unorm;
constexpr WGPUTextureFormat kFormatoProfundidade = WGPUTextureFormat_Depth24Plus;

/** Profundidade que a pass A grava. */
constexpr float kZBase = 0.5f;
/** Pass B ATRÁS da base: 0.9 > 0.5, tem de ser rejeitada pelo LessEqual. */
constexpr float kZAtras = 0.9f;
/** Pass B NA FRENTE da base: 0.1 <= 0.5, tem de passar (caso de controle). */
constexpr float kZFrente = 0.1f;
/** Valor com que a pass A limpa a profundidade (o "fundo"). */
constexpr float kProfundidadeLimpa = 1.0f;

constexpr uint32_t kCanaisRgba = 4;
using Cor = float[kCanaisRgba];
constexpr float kVermelho[kCanaisRgba] = {1.0f, 0.0f, 0.0f, 1.0f};
constexpr float kVerde[kCanaisRgba] = {0.0f, 1.0f, 0.0f, 1.0f};
constexpr WGPUColor kPreto{0.0, 0.0, 0.0, 1.0};

/** Alinhamento de `bytesPerRow` exigido no copy de textura para buffer. */
constexpr uint32_t kBytesPerRowAlign = 256;
/** RGBA8Unorm: um byte por canal. */
constexpr uint32_t kBytesPorPixel = 4;
constexpr float kMaxCanal8Bits = 255.0f;
/** Limiar para classificar um canal como "aceso". */
constexpr float kLimiarCanal = 0.5f;
/** Vértices do triângulo de tela cheia. */
constexpr uint32_t kVerticesDoTriangulo = 3;

/**
 * Triângulo de tela cheia. A profundidade NÃO vem do vértice: vem do viewport
 * (`minDepth == maxDepth`), o que evita uniforme e bind group só para escolher a
 * distância — mesmo truque do `dual_pass_spike.cpp`. A cor é substituída no
 * texto antes de compilar (placeholder `COR_DO_PASSE`).
 */
const char* kFonteWgsl = R"WGSL(
@vertex
fn vs(@builtin(vertex_index) i : u32) -> @builtin(position) vec4f {
  var pos = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(pos[i], 0.0, 1.0);
}

@fragment
fn fs() -> @location(0) vec4f {
  return vec4f(COR_DO_PASSE);
}
)WGSL";

/** Escreve uma linha em stderr. */
void linha(const char* formato, ...) {
  va_list args;
  va_start(args, formato);
  std::vfprintf(stderr, formato, args);
  va_end(args);
  // Fim de linha por código, e não por escape dentro do literal: neste
  // repositório literais com escape de nova linha já vieram quebrados na
  // gravação do arquivo e derrubaram a compilação.
  std::fputc(0x0A, stderr);
  std::fflush(stderr);
}

struct MapResult {
  bool done = false;
  WGPUMapAsyncStatus status = WGPUMapAsyncStatus_Error;
};

void aoMapear(WGPUMapAsyncStatus status, WGPUStringView, void* ud, void*) {
  auto* r = static_cast<MapResult*>(ud);
  r->status = status;
  r->done = true;
}

/** Substitui o placeholder de cor pela cor literal desta pass. */
std::string montarFonte(const Cor cor) {
  char literal[64];
  std::snprintf(literal, sizeof(literal), "%.1f, %.1f, %.1f, %.1f", cor[0], cor[1],
                cor[2], cor[3]);
  std::string fonte = kFonteWgsl;
  const std::string alvo = "COR_DO_PASSE";
  const size_t onde = fonte.find(alvo);
  if (onde != std::string::npos) fonte.replace(onde, alvo.size(), literal);
  return fonte;
}

/** Pipeline de uma das passes: cor fixa, e a política de profundidade dela. */
WGPURenderPipeline criarPipeline(WGPUDevice device, const Cor cor,
                                 WGPUCompareFunction comparacao, bool escreveProfundidade) {
  const std::string fonte = montarFonte(cor);
  WGPUShaderSourceWGSL wgsl = WGPU_SHADER_SOURCE_WGSL_INIT;
  wgsl.code = WGPUStringView{fonte.c_str(), fonte.size()};
  WGPUShaderModuleDescriptor sd = WGPU_SHADER_MODULE_DESCRIPTOR_INIT;
  sd.nextInChain = &wgsl.chain;
  WGPUShaderModule modulo = wgpuDeviceCreateShaderModule(device, &sd);
  if (!modulo) return nullptr;

  WGPUColorTargetState alvo = WGPU_COLOR_TARGET_STATE_INIT;
  alvo.format = kFormatoCor;
  alvo.writeMask = WGPUColorWriteMask_All;

  WGPUFragmentState fs = WGPU_FRAGMENT_STATE_INIT;
  fs.module = modulo;
  fs.entryPoint = WGPUStringView{"fs", 2};
  fs.targetCount = 1;
  fs.targets = &alvo;

  WGPUDepthStencilState ds = WGPU_DEPTH_STENCIL_STATE_INIT;
  ds.format = kFormatoProfundidade;
  ds.depthWriteEnabled =
      escreveProfundidade ? WGPUOptionalBool_True : WGPUOptionalBool_False;
  ds.depthCompare = comparacao;

  WGPURenderPipelineDescriptor pd = WGPU_RENDER_PIPELINE_DESCRIPTOR_INIT;
  pd.vertex.module = modulo;
  pd.vertex.entryPoint = WGPUStringView{"vs", 2};
  pd.primitive.topology = WGPUPrimitiveTopology_TriangleList;
  pd.fragment = &fs;
  pd.depthStencil = &ds;
  pd.multisample.count = 1;

  WGPURenderPipeline pipeline = wgpuDeviceCreateRenderPipeline(device, &pd);
  wgpuShaderModuleRelease(modulo);
  return pipeline;
}

WGPUTexture criarTextura(WGPUDevice device, WGPUTextureFormat formato,
                         WGPUTextureUsage usos) {
  WGPUTextureDescriptor td = WGPU_TEXTURE_DESCRIPTOR_INIT;
  td.usage = usos;
  td.dimension = WGPUTextureDimension_2D;
  td.size = {kLado, kLado, 1};
  td.format = formato;
  td.mipLevelCount = 1;
  td.sampleCount = 1;
  return wgpuDeviceCreateTexture(device, &td);
}

/**
 * Grava UMA pass num command encoder PRÓPRIO e a submete SOZINHA — é isso que o
 * teste investiga, então não pode haver atalho de juntar as duas no mesmo
 * command buffer.
 */
void submeterPass(HostGpu* gpu, WGPUTextureView viewCor, WGPUTextureView viewProfundidade,
                  WGPURenderPipeline pipeline, bool limpar, float z) {
  WGPURenderPassColorAttachment cor = WGPU_RENDER_PASS_COLOR_ATTACHMENT_INIT;
  cor.view = viewCor;
  cor.loadOp = limpar ? WGPULoadOp_Clear : WGPULoadOp_Load;
  cor.storeOp = WGPUStoreOp_Store;
  cor.clearValue = kPreto;

  WGPURenderPassDepthStencilAttachment prof =
      WGPU_RENDER_PASS_DEPTH_STENCIL_ATTACHMENT_INIT;
  prof.view = viewProfundidade;
  prof.depthLoadOp = limpar ? WGPULoadOp_Clear : WGPULoadOp_Load;
  prof.depthStoreOp = WGPUStoreOp_Store;
  prof.depthClearValue = kProfundidadeLimpa;

  WGPURenderPassDescriptor rp = WGPU_RENDER_PASS_DESCRIPTOR_INIT;
  rp.colorAttachmentCount = 1;
  rp.colorAttachments = &cor;
  rp.depthStencilAttachment = &prof;

  WGPUCommandEncoderDescriptor ed = WGPU_COMMAND_ENCODER_DESCRIPTOR_INIT;
  WGPUCommandEncoder encoder = wgpuDeviceCreateCommandEncoder(gpu->device, &ed);
  WGPURenderPassEncoder pass = wgpuCommandEncoderBeginRenderPass(encoder, &rp);
  const float lado = static_cast<float>(kLado);
  // minDepth == maxDepth: todo fragmento sai exatamente nesta profundidade.
  wgpuRenderPassEncoderSetViewport(pass, 0.0f, 0.0f, lado, lado, z, z);
  wgpuRenderPassEncoderSetPipeline(pass, pipeline);
  wgpuRenderPassEncoderDraw(pass, kVerticesDoTriangulo, 1, 0, 0);
  wgpuRenderPassEncoderEnd(pass);
  wgpuRenderPassEncoderRelease(pass);

  WGPUCommandBufferDescriptor cd = WGPU_COMMAND_BUFFER_DESCRIPTOR_INIT;
  WGPUCommandBuffer cmd = wgpuCommandEncoderFinish(encoder, &cd);
  wgpuQueueSubmit(gpu->queue, 1, &cmd);
  wgpuCommandBufferRelease(cmd);
  wgpuCommandEncoderRelease(encoder);
}

/** Lê o pixel central da textura de cor, já normalizado em 0..1. */
bool lerPixelCentral(HostGpu* gpu, WGPUTexture textura, Cor saida) {
  WGPUBufferDescriptor bd = WGPU_BUFFER_DESCRIPTOR_INIT;
  bd.size = kBytesPerRowAlign;
  bd.usage = WGPUBufferUsage_CopyDst | WGPUBufferUsage_MapRead;
  WGPUBuffer leitura = wgpuDeviceCreateBuffer(gpu->device, &bd);
  if (!leitura) return false;

  WGPUTexelCopyTextureInfo origem = WGPU_TEXEL_COPY_TEXTURE_INFO_INIT;
  origem.texture = textura;
  origem.origin = WGPUOrigin3D{kLado / 2, kLado / 2, 0};

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
    const void* bytes = wgpuBufferGetConstMappedRange(leitura, 0, kBytesPerRowAlign);
    if (bytes) {
      uint8_t v[kCanaisRgba];
      std::memcpy(v, bytes, kBytesPorPixel);
      for (uint32_t c = 0; c < kCanaisRgba; ++c) saida[c] = v[c] / kMaxCanal8Bits;
      ok = true;
    }
    wgpuBufferUnmap(leitura);
  }
  wgpuBufferRelease(leitura);
  return ok;
}

/** Classificação grosseira da cor lida — só precisa distinguir os três casos. */
enum class CorLida { Vermelho, Verde, Outra };

CorLida classificar(const Cor cor) {
  const bool r = cor[0] > kLimiarCanal;
  const bool g = cor[1] > kLimiarCanal;
  if (r && !g) return CorLida::Vermelho;
  if (g && !r) return CorLida::Verde;
  return CorLida::Outra;
}

const char* nomeDaCor(CorLida c) {
  switch (c) {
    case CorLida::Vermelho: return "VERMELHO";
    case CorLida::Verde: return "VERDE";
    default: return "OUTRA";
  }
}

/** Recursos de um cenário: texturas próprias, para não herdar estado. */
struct Cenario {
  WGPUTexture cor = nullptr;
  WGPUTexture profundidade = nullptr;
  WGPUTextureView viewCor = nullptr;
  WGPUTextureView viewProfundidade = nullptr;

  bool criar(WGPUDevice device) {
    cor = criarTextura(device, kFormatoCor,
                       static_cast<WGPUTextureUsage>(WGPUTextureUsage_RenderAttachment |
                                                     WGPUTextureUsage_CopySrc));
    profundidade =
        criarTextura(device, kFormatoProfundidade, WGPUTextureUsage_RenderAttachment);
    if (!cor || !profundidade) return false;
    viewCor = wgpuTextureCreateView(cor, nullptr);
    viewProfundidade = wgpuTextureCreateView(profundidade, nullptr);
    return viewCor && viewProfundidade;
  }

  void destruir() {
    if (viewCor) wgpuTextureViewRelease(viewCor);
    if (viewProfundidade) wgpuTextureViewRelease(viewProfundidade);
    if (cor) wgpuTextureRelease(cor);
    if (profundidade) wgpuTextureRelease(profundidade);
  }
};

/**
 * Roda um cenário completo e devolve a cor do pixel central.
 *
 * `comZPassB` menor que zero significa "só a pass A" (cenário de sanidade).
 */
bool rodarCenario(HostGpu* gpu, WGPURenderPipeline passA, WGPURenderPipeline passB,
                  float zPassB, bool incluiPassB, Cor saida) {
  Cenario cenario;
  if (!cenario.criar(gpu->device)) {
    cenario.destruir();
    return false;
  }
  // Pass A: command encoder próprio, submit próprio.
  submeterPass(gpu, cenario.viewCor, cenario.viewProfundidade, passA, /*limpar=*/true,
               kZBase);
  if (incluiPassB) {
    // Pass B: command encoder NOVO, submit NOVO, profundidade com Load. É aqui
    // que a premissa do ADR-0237 é posta à prova.
    submeterPass(gpu, cenario.viewCor, cenario.viewProfundidade, passB, /*limpar=*/false,
                 zPassB);
  }
  const bool ok = lerPixelCentral(gpu, cenario.cor, saida);
  cenario.destruir();
  return ok;
}

void relatar(const char* cenario, const Cor cor, const char* esperado, bool passou) {
  linha("[depth-selftest] %s pixel=(%.2f,%.2f,%.2f) lido=%s esperado=%s veredito=%s",
        cenario, cor[0], cor[1], cor[2], nomeDaCor(classificar(cor)), esperado,
        passou ? "PASSOU" : "FALHOU");
}

void executar(HostGpu* gpu) {
  // Pass A: escreve profundidade sempre (Always), pinta de vermelho.
  WGPURenderPipeline passA =
      criarPipeline(gpu->device, kVermelho, WGPUCompareFunction_Always,
                    /*escreveProfundidade=*/true);
  // Pass B: só testa a profundidade, não escreve; pinta de verde.
  WGPURenderPipeline passB =
      criarPipeline(gpu->device, kVerde, WGPUCompareFunction_LessEqual,
                    /*escreveProfundidade=*/false);
  if (!passA || !passB) {
    linha("[depth-selftest] falhou ao criar os pipelines — teste INVALIDO");
    if (passA) wgpuRenderPipelineRelease(passA);
    if (passB) wgpuRenderPipelineRelease(passB);
    return;
  }

  Cor base{};
  Cor oclusao{};
  Cor controle{};
  const bool okBase =
      rodarCenario(gpu, passA, passB, 0.0f, /*incluiPassB=*/false, base);
  const bool okOclusao =
      rodarCenario(gpu, passA, passB, kZAtras, /*incluiPassB=*/true, oclusao);
  const bool okControle =
      rodarCenario(gpu, passA, passB, kZFrente, /*incluiPassB=*/true, controle);

  wgpuRenderPipelineRelease(passA);
  wgpuRenderPipelineRelease(passB);

  if (!okBase || !okOclusao || !okControle) {
    linha("[depth-selftest] leitura de pixel falhou (base=%d oclusao=%d controle=%d)"
          " — teste INVALIDO",
          static_cast<int>(okBase), static_cast<int>(okOclusao),
          static_cast<int>(okControle));
    return;
  }

  linha("[depth-selftest] textura=%ux%u cor=RGBA8Unorm prof=Depth24Plus"
        " zA=%.2f zB_atras=%.2f zB_frente=%.2f",
        kLado, kLado, kZBase, kZAtras, kZFrente);

  const CorLida cBase = classificar(base);
  const CorLida cOclusao = classificar(oclusao);
  const CorLida cControle = classificar(controle);

  relatar("base    ", base, "VERMELHO", cBase == CorLida::Vermelho);
  relatar("oclusao ", oclusao, "VERMELHO", cOclusao == CorLida::Vermelho);
  relatar("controle", controle, "VERDE", cControle == CorLida::Verde);

  // O instrumento só vale se a sanidade e o controle se comportarem: a pass A
  // tem de aparecer, e a pass B tem de conseguir passar quando DEVE passar.
  const bool instrumentoValido =
      cBase == CorLida::Vermelho && cControle == CorLida::Verde;
  if (!instrumentoValido) {
    linha("[depth-selftest] INSTRUMENTO INVALIDO: base ou controle nao se"
          " comportaram — o veredito do cenario de oclusao NAO pode ser usado");
    return;
  }
  linha("[depth-selftest] instrumento validado (base VERMELHO, controle VERDE)");

  if (cOclusao == CorLida::Vermelho) {
    linha("[depth-selftest] CONCLUSAO: a premissa do ADR-0237 VALE — a"
          " profundidade escrita pela pass A persistiu entre command buffers e"
          " foi lida pela pass B com depthLoadOp=Load");
  } else {
    linha("[depth-selftest] CONCLUSAO: a premissa do ADR-0237 NAO VALE — a pass"
          " B passou no teste de profundidade, ou seja NAO enxergou o que a pass"
          " A escreveu; o desenho do marco precisa mudar");
  }
}

}  // namespace

void runDepthSelftestOnce(HostGpu* gpu) {
  static const bool ligado = std::getenv("CORTEX_DEPTH_SELFTEST") != nullptr;
  if (!ligado) return;
  static bool jaRodou = false;
  if (jaRodou) return;
  // O device vem do JS (navigator.gpu), então os primeiros frames do host podem
  // ainda não tê-lo — esperar sem marcar como executado.
  if (!gpu || !gpu->device || !gpu->queue || !gpu->instance) return;
  jaRodou = true;
  executar(gpu);
}

}  // namespace webgpu
