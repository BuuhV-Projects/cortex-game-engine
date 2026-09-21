// Ver native_pass.h (SPEC-0241, passo 3).
#include "native_pass.h"

#include "../core/host_gpu.h"
#include "../shims/geometry_registry_shim.h"
#include "../webgpu/internal.h"
#include "depth_peek.h"
#include "geometry_registry.h"

#include <webgpu/wgpu.h>

#include <algorithm>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

namespace render {
namespace {

/** Floats de uma matriz 4x4. */
constexpr uint32_t kMatrixFloats = 16;
/** Alinhamento que o WebGPU exige para offset dinâmico de uniforme. */
constexpr uint64_t kUniformSlotAlign = 256;
/** Slots pré-alocados; cresce conforme a cena pedir. */
constexpr uint32_t kSlotsIniciais = 512;
/** Passo padrão quando a geometria é densa (3 floats de posição). */
constexpr uint64_t kVertexStridePadrao = 3 * sizeof(float);

/**
 * Uniforme por objeto. A matriz de câmera entra junto porque, enquanto houver
 * um bind group só, é mais barato repetir 64 bytes por slot do que manter dois
 * grupos e trocar os dois por objeto.
 */
struct UniformesDoObjeto {
  float viewProjection[kMatrixFloats];
  float model[kMatrixFloats];
  float color[4];
};

const char* kShaderMalha = R"WGSL(
struct Uniformes {
  viewProjection : mat4x4f,
  model : mat4x4f,
  color : vec4f,
};
@group(0) @binding(0) var<uniform> u : Uniformes;

@vertex
fn vs(@location(0) position : vec3f) -> @builtin(position) vec4f {
  return u.viewProjection * u.model * vec4f(position, 1.0);
}

@fragment
fn fs() -> @location(0) vec4f {
  return u.color;
}
)WGSL";

/** Recursos do passe, criados uma vez e reusados entre frames. */
struct Recursos {
  WGPURenderPipeline pipeline = nullptr;
  WGPUBindGroupLayout bindGroupLayout = nullptr;
  WGPUBindGroup bindGroup = nullptr;
  WGPUBuffer uniformes = nullptr;
  uint32_t slots = 0;
  WGPUTextureFormat formatoCor = WGPUTextureFormat_Undefined;
  WGPUTextureFormat formatoProfundidade = WGPUTextureFormat_Undefined;
  uint32_t amostras = 0;
  /** O passo entra no pipeline, então cada passo distinto pede um pipeline. */
  uint32_t stride = 0;
  /**
   * Profundidade PRÓPRIA do passe, provisória.
   *
   * O ideal é compartilhar a do `three` — assim a oclusão entre os dois motores
   * sai de graça. Isso não fechou: a profundidade que o JS entrega está zerada,
   * e a view que o host captura das passes dele também lê zeros (SPEC-0241).
   * Com buffer próprio a oclusão ENTRE os objetos migrados fica correta, que é
   * o suficiente para medir o custo do caminho — que é a pergunta do marco.
   * A oclusão contra o `three` fica em aberto.
   */
  WGPUTexture profundidadePropria = nullptr;
  WGPUTextureView viewPropria = nullptr;
  uint32_t largura = 0;
  uint32_t altura = 0;
};

Recursos& recursos() {
  static Recursos instancia;
  return instancia;
}

void liberarBuffer(Recursos& r) {
  if (r.bindGroup) wgpuBindGroupRelease(r.bindGroup);
  if (r.uniformes) wgpuBufferRelease(r.uniformes);
  r.bindGroup = nullptr;
  r.uniformes = nullptr;
  r.slots = 0;
}

/**
 * Cria o layout do bind group. Fica SEPARADO do pipeline porque não depende do
 * passo do vértice: juntá-los fazia o bind group nascer antes do layout existir
 * quando o passo mudava, e o wgpu aborta o processo com "invalid bind group
 * layout" — sem exceção, sem chance de tratar.
 */
bool garantirBindGroupLayout(HostGpu* gpu, Recursos& r) {
  if (r.bindGroupLayout) return true;

  WGPUBindGroupLayoutEntry entradaLayout = WGPU_BIND_GROUP_LAYOUT_ENTRY_INIT;
  entradaLayout.binding = 0;
  entradaLayout.visibility = WGPUShaderStage_Vertex | WGPUShaderStage_Fragment;
  entradaLayout.buffer.type = WGPUBufferBindingType_Uniform;
  // Offset dinâmico: um bind group para a cena inteira, trocando só o offset
  // por objeto. É o que o spike da fase 1 mediu como parte da vantagem.
  entradaLayout.buffer.hasDynamicOffset = true;
  entradaLayout.buffer.minBindingSize = sizeof(UniformesDoObjeto);

  WGPUBindGroupLayoutDescriptor ld = WGPU_BIND_GROUP_LAYOUT_DESCRIPTOR_INIT;
  ld.entryCount = 1;
  ld.entries = &entradaLayout;
  r.bindGroupLayout = wgpuDeviceCreateBindGroupLayout(gpu->device, &ld);
  return r.bindGroupLayout != nullptr;
}

/** Cria (ou recria) a profundidade própria do passe no tamanho do alvo. */
bool garantirProfundidadePropria(HostGpu* gpu, Recursos& r, uint32_t largura,
                                 uint32_t altura, uint32_t amostras) {
  if (r.viewPropria && r.largura == largura && r.altura == altura) return true;
  if (r.viewPropria) wgpuTextureViewRelease(r.viewPropria);
  if (r.profundidadePropria) wgpuTextureRelease(r.profundidadePropria);
  r.viewPropria = nullptr;
  r.profundidadePropria = nullptr;

  WGPUTextureDescriptor td = WGPU_TEXTURE_DESCRIPTOR_INIT;
  td.size = {largura, altura, 1};
  td.format = WGPUTextureFormat_Depth24Plus;
  td.usage = WGPUTextureUsage_RenderAttachment;
  td.dimension = WGPUTextureDimension_2D;
  td.sampleCount = amostras == 0 ? 1 : amostras;
  r.profundidadePropria = wgpuDeviceCreateTexture(gpu->device, &td);
  if (!r.profundidadePropria) return false;
  r.viewPropria = wgpuTextureCreateView(r.profundidadePropria, nullptr);
  if (!r.viewPropria) return false;
  r.largura = largura;
  r.altura = altura;
  return true;
}

/** Garante buffer de uniformes com espaço para `necessarios` objetos. */
bool garantirUniformes(HostGpu* gpu, Recursos& r, uint32_t necessarios) {
  if (r.uniformes && r.slots >= necessarios) return true;
  liberarBuffer(r);
  const uint32_t slots = necessarios > kSlotsIniciais ? necessarios : kSlotsIniciais;

  WGPUBufferDescriptor bd = WGPU_BUFFER_DESCRIPTOR_INIT;
  bd.size = static_cast<uint64_t>(slots) * kUniformSlotAlign;
  bd.usage = WGPUBufferUsage_Uniform | WGPUBufferUsage_CopyDst;
  r.uniformes = wgpuDeviceCreateBuffer(gpu->device, &bd);
  if (!r.uniformes) return false;

  WGPUBindGroupEntry entrada = WGPU_BIND_GROUP_ENTRY_INIT;
  entrada.binding = 0;
  entrada.buffer = r.uniformes;
  entrada.size = sizeof(UniformesDoObjeto);

  WGPUBindGroupDescriptor gd = WGPU_BIND_GROUP_DESCRIPTOR_INIT;
  gd.layout = r.bindGroupLayout;
  gd.entryCount = 1;
  gd.entries = &entrada;
  r.bindGroup = wgpuDeviceCreateBindGroup(gpu->device, &gd);
  if (!r.bindGroup) {
    liberarBuffer(r);
    return false;
  }
  r.slots = slots;
  return true;
}

/** Cria (ou recria) o pipeline quando os formatos do alvo mudam. */
bool garantirPipeline(HostGpu* gpu, Recursos& r, WGPUTextureFormat cor,
                      WGPUTextureFormat profundidade, uint32_t amostras,
                      uint32_t stride) {
  if (r.pipeline && r.formatoCor == cor && r.formatoProfundidade == profundidade &&
      r.amostras == amostras && r.stride == stride) {
    return true;
  }
  // Só o pipeline: o layout do bind group e o buffer de uniformes sobrevivem à
  // troca de passo, e recriá-los aqui invalidaria o bind group em uso.
  if (r.pipeline) wgpuRenderPipelineRelease(r.pipeline);
  r.pipeline = nullptr;
  if (!garantirBindGroupLayout(gpu, r)) return false;

  WGPUPipelineLayoutDescriptor pld = WGPU_PIPELINE_LAYOUT_DESCRIPTOR_INIT;
  pld.bindGroupLayoutCount = 1;
  pld.bindGroupLayouts = &r.bindGroupLayout;
  WGPUPipelineLayout layout = wgpuDeviceCreatePipelineLayout(gpu->device, &pld);
  if (!layout) return false;

  WGPUShaderSourceWGSL wgsl = WGPU_SHADER_SOURCE_WGSL_INIT;
  wgsl.code = WGPUStringView{kShaderMalha, std::strlen(kShaderMalha)};
  WGPUShaderModuleDescriptor sd = WGPU_SHADER_MODULE_DESCRIPTOR_INIT;
  sd.nextInChain = &wgsl.chain;
  WGPUShaderModule modulo = wgpuDeviceCreateShaderModule(gpu->device, &sd);
  if (!modulo) {
    wgpuPipelineLayoutRelease(layout);
    return false;
  }

  WGPUVertexAttribute atributo = WGPU_VERTEX_ATTRIBUTE_INIT;
  atributo.format = WGPUVertexFormat_Float32x3;
  atributo.offset = 0;
  atributo.shaderLocation = 0;

  WGPUVertexBufferLayout vbl = WGPU_VERTEX_BUFFER_LAYOUT_INIT;
  vbl.arrayStride = stride != 0 ? stride : kVertexStridePadrao;
  vbl.stepMode = WGPUVertexStepMode_Vertex;
  vbl.attributeCount = 1;
  vbl.attributes = &atributo;

  WGPUColorTargetState alvo = WGPU_COLOR_TARGET_STATE_INIT;
  alvo.format = cor;
  alvo.writeMask = WGPUColorWriteMask_All;

  WGPUFragmentState fs = WGPU_FRAGMENT_STATE_INIT;
  fs.module = modulo;
  fs.entryPoint = WGPUStringView{"fs", 2};
  fs.targetCount = 1;
  fs.targets = &alvo;

  WGPUDepthStencilState ds = WGPU_DEPTH_STENCIL_STATE_INIT;
  ds.format = profundidade;
  ds.depthWriteEnabled = WGPUOptionalBool_True;
  ds.depthCompare = WGPUCompareFunction_LessEqual;

  WGPURenderPipelineDescriptor pd = WGPU_RENDER_PIPELINE_DESCRIPTOR_INIT;
  pd.layout = layout;
  pd.vertex.module = modulo;
  pd.vertex.entryPoint = WGPUStringView{"vs", 2};
  pd.vertex.bufferCount = 1;
  pd.vertex.buffers = &vbl;
  pd.primitive.topology = WGPUPrimitiveTopology_TriangleList;
  // O `three` desenha as faces da frente com winding anti-horário; seguir o
  // mesmo critério evita a malha sair vazada por dentro.
  pd.primitive.frontFace = WGPUFrontFace_CCW;
  pd.primitive.cullMode = WGPUCullMode_Back;
  pd.fragment = &fs;
  pd.depthStencil = &ds;
  pd.multisample.count = amostras;

  r.pipeline = wgpuDeviceCreateRenderPipeline(gpu->device, &pd);
  wgpuShaderModuleRelease(modulo);
  wgpuPipelineLayoutRelease(layout);
  if (!r.pipeline) return false;

  r.formatoCor = cor;
  r.formatoProfundidade = profundidade;
  r.amostras = amostras;
  r.stride = stride;
  return true;
}

}  // namespace

uint32_t drawNativeItems(HostGpu* gpu, WGPUTexture alvoCor, WGPUTexture alvoProfundidade,
                         WGPUTextureView viewProfundidade, const float viewProjection[16],
                         const NativeDrawItem* itens, uint32_t total) {
  if (!gpu || !gpu->device || !gpu->queue || !viewProjection) return 0;
  if (!alvoCor) alvoCor = gpu->offscreenTexture;
  if (!alvoCor || total == 0) return 0;

  // Sonda: pinta o conteudo do buffer de profundidade e sai. Serve para ver o
  // que ha nele, em vez de inferir pelo comportamento do teste.
  if (depthPeekEnabled()) {
    depthPeek(gpu, alvoCor, alvoProfundidade, viewProfundidade);
    return 0;
  }

  Recursos& r = recursos();
  const WGPUTextureFormat formatoCor = wgpuTextureGetFormat(alvoCor);
  const uint32_t amostras = wgpuTextureGetSampleCount(alvoCor);
  if (!garantirProfundidadePropria(gpu, r, wgpuTextureGetWidth(alvoCor),
                                   wgpuTextureGetHeight(alvoCor), amostras)) {
    return 0;
  }
  const WGPUTextureFormat formatoProf = WGPUTextureFormat_Depth24Plus;
  if (!garantirBindGroupLayout(gpu, r)) return 0;
  if (!garantirUniformes(gpu, r, total)) return 0;

  const GeometryRegistry& registro = shims::geometryRegistry();

  // Escreve os uniformes dos itens que TÊM geometria, e guarda a ordem para o
  // laço de desenho não precisar consultar o registro duas vezes.
  struct Pronto {
    const GeometryEntry* geometria;
    uint32_t slot;
  };
  std::vector<Pronto> prontos;
  prontos.reserve(total);

  UniformesDoObjeto u;
  std::memcpy(u.viewProjection, viewProjection, sizeof(u.viewProjection));
  for (uint32_t i = 0; i < total; ++i) {
    const GeometryEntry* geometria = registro.find(itens[i].geometryId);
    if (!geometria) continue;  // pula: nunca aproxima
    std::memcpy(u.model, itens[i].model, sizeof(u.model));
    std::memcpy(u.color, itens[i].color, sizeof(u.color));
    const uint32_t slot = static_cast<uint32_t>(prontos.size());
    wgpuQueueWriteBuffer(gpu->queue, r.uniformes, slot * kUniformSlotAlign, &u, sizeof(u));
    prontos.push_back({geometria, slot});
  }
  if (prontos.empty()) return 0;

  // O passo do vértice faz parte do pipeline, então itens com passos diferentes
  // não cabem no mesmo. Agrupa por passo para trocar de pipeline o mínimo
  // possível — na cena cozida o passo costuma ser um só.
  std::stable_sort(prontos.begin(), prontos.end(), [](const Pronto& a, const Pronto& b) {
    return a.geometria->vertexStride < b.geometria->vertexStride;
  });

  WGPUTextureView viewCor = wgpuTextureCreateView(alvoCor, nullptr);
  // Preferir a view que o `three` usa: criar uma nova a partir da textura pode
  // apontar para um recurso diferente do que ele escreveu.
  const bool viewEmprestada = viewProfundidade != nullptr;
  WGPUTextureView viewProf =
      viewEmprestada ? viewProfundidade : wgpuTextureCreateView(alvoProfundidade, nullptr);

  // `load` nos dois: o passe entra DEPOIS do `three`, preservando a cor e a
  // profundidade que ele escreveu — é a profundidade dele que decide a oclusão.
  WGPURenderPassColorAttachment cor = WGPU_RENDER_PASS_COLOR_ATTACHMENT_INIT;
  cor.view = viewCor;
  cor.loadOp = WGPULoadOp_Load;
  cor.storeOp = WGPUStoreOp_Store;

  WGPURenderPassDepthStencilAttachment prof = WGPU_RENDER_PASS_DEPTH_STENCIL_ATTACHMENT_INIT;
  prof.view = viewProf;
  // Profundidade propria: limpa por frame. A oclusao ENTRE os migrados sai
  // correta; contra o `three` fica em aberto (ver SPEC-0241).
  prof.depthLoadOp = WGPULoadOp_Clear;
  prof.depthClearValue = 1.0f;
  prof.depthStoreOp = WGPUStoreOp_Store;

  WGPURenderPassDescriptor rp = WGPU_RENDER_PASS_DESCRIPTOR_INIT;
  rp.colorAttachmentCount = 1;
  rp.colorAttachments = &cor;
  rp.depthStencilAttachment = &prof;

  WGPUCommandEncoderDescriptor ed = WGPU_COMMAND_ENCODER_DESCRIPTOR_INIT;
  WGPUCommandEncoder encoder = wgpuDeviceCreateCommandEncoder(gpu->device, &ed);
  WGPURenderPassEncoder pass = wgpuCommandEncoderBeginRenderPass(encoder, &rp);

  uint32_t desenhados = 0;
  uint32_t strideAtual = 0;
  for (const Pronto& item : prontos) {
    if (item.geometria->vertexStride != strideAtual) {
      strideAtual = item.geometria->vertexStride;
      if (!garantirPipeline(gpu, r, formatoCor, formatoProf, amostras, strideAtual)) break;
      wgpuRenderPassEncoderSetPipeline(pass, r.pipeline);
    }
    const uint32_t offset = item.slot * static_cast<uint32_t>(kUniformSlotAlign);
    wgpuRenderPassEncoderSetBindGroup(pass, 0, r.bindGroup, 1, &offset);
    wgpuRenderPassEncoderSetVertexBuffer(pass, 0, item.geometria->vertexBuffer,
                                         item.geometria->vertexOffset, WGPU_WHOLE_SIZE);
    if (item.geometria->indexBuffer) {
      const WGPUIndexFormat formatoIndice = item.geometria->indexIs32Bit
                                                ? WGPUIndexFormat_Uint32
                                                : WGPUIndexFormat_Uint16;
      wgpuRenderPassEncoderSetIndexBuffer(pass, item.geometria->indexBuffer,
                                          formatoIndice, 0, WGPU_WHOLE_SIZE);
      wgpuRenderPassEncoderDrawIndexed(pass, item.geometria->indexCount, 1, 0, 0, 0);
    } else {
      wgpuRenderPassEncoderDraw(pass, item.geometria->vertexCount, 1, 0, 0);
    }
    ++desenhados;
  }

  wgpuRenderPassEncoderEnd(pass);
  wgpuRenderPassEncoderRelease(pass);

  WGPUCommandBufferDescriptor cd = WGPU_COMMAND_BUFFER_DESCRIPTOR_INIT;
  WGPUCommandBuffer cmd = wgpuCommandEncoderFinish(encoder, &cd);
  wgpuQueueSubmit(gpu->queue, 1, &cmd);
  wgpuCommandBufferRelease(cmd);
  wgpuCommandEncoderRelease(encoder);
  wgpuTextureViewRelease(viewCor);  // a de profundidade e do passe e sobrevive
  return desenhados;
}

}  // namespace render
