// Ver shadow_pass.h (SPEC-0245, E5 do passo 2).
#include "shadow_pass.h"

#include "../core/host_gpu.h"
#include "../shims/geometry_registry_shim.h"
#include "geometry_registry.h"
#include "instance_buffer_store.h"
#include "shadow_math.h"
#include "shadow_pass_shaders.h"
#include "../webgpu/pass_timing.h"

#include <webgpu/wgpu.h>

#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <vector>

namespace render {
namespace {

/** Alinhamento que o WebGPU exige para offset dinâmico de uniforme. */
constexpr uint64_t kUniformSlotAlign = 256;
/** Slots pré-alocados; cresce conforme a cena pedir. */
constexpr uint32_t kSlotsIniciais = 256;
/** Passo padrão quando a geometria é densa (3 floats de posição). */
constexpr uint64_t kVertexStridePadrao = 3 * sizeof(float);
/** Valor de limpeza da profundidade: 1.0 = plano distante. */
constexpr float kDepthClearValue = 1.0f;
/** Uma amostra: o shadow map do `three` não é multiamostrado. */
constexpr uint32_t kAmostras = 1;
/** `mat3x3f` no WGSL: 3 colunas de `vec4f` (o 4º float é preenchimento). */
constexpr uint32_t kUvColumns = 3;
constexpr uint32_t kUvColumnFloats = 4;
/** Linhas úteis de cada coluna da `Matrix3` do `three`. */
constexpr uint32_t kUvRows = 3;
/** Floats de preenchimento depois de `alphaTest` (o struct fecha em 256 bytes). */
constexpr uint32_t kUniformPadding = 3;

/**
 * Uniforme por caster: as três matrizes de {@link ShadowCasterMatrices} mais o
 * recorte alfa (SPEC-0642) — `uvTransform` em 3 colunas `vec4f` (o `mat3x3f` do
 * WGSL) e `alphaTest`. Ocupa o slot inteiro; as variantes depth-only só leem as
 * matrizes.
 */
struct ShadowCasterUniforms {
  ShadowCasterMatrices matrices;
  float uvTransform[kUvColumns * kUvColumnFloats];
  float alphaTest;
  float padding[kUniformPadding];
};
static_assert(sizeof(ShadowCasterUniforms) == kUniformSlotAlign,
              "o uniforme do caster tem de casar com o struct do WGSL");

/** Colunas da matriz de instância = atributos `vec4f` por instância. */
constexpr uint32_t kInstanceColumns = 4;
/** Bytes de uma coluna (`vec4f`). */
constexpr uint64_t kInstanceColumnBytes = 4 * sizeof(float);
/** Primeiro `@location` das colunas (o 0 é a posição). */
constexpr uint32_t kInstanceFirstLocation = 1;
/** Buffers de vértice do pipeline: posição; posição + matrizes por instância. */
constexpr uint32_t kVertexBuffersSimples = 1;
constexpr uint32_t kVertexBuffersInstanciados = 2;
/** Slot do buffer de matrizes por instância no `setVertexBuffer`. */
constexpr uint32_t kInstanceBufferSlot = 1;
/** `@location` do UV no recorte alfa (SPEC-0642), depois das colunas da instância. */
constexpr uint32_t kUvLocation = 5;
/** Grupos do pipeline: só o uniforme; uniforme + textura/sampler do recorte. */
constexpr uint32_t kGruposSimples = 1;
constexpr uint32_t kGruposComRecorte = 2;
/** Grupo da textura do recorte no `setBindGroup`. */
constexpr uint32_t kGrupoRecorte = 1;

/**
 * Um pipeline já compilado, com a chave que o distingue.
 *
 * Duas coisas entram no pipeline e variam dentro de um mesmo frame: o PASSO do
 * vértice (layout da geometria) e o CULL MODE (lado da face do material). O
 * formato da profundidade vale para o passe inteiro, e quando ele muda tudo é
 * descartado — o `three` recria a textura, e um pipeline de outro formato
 * não serve.
 */
struct PipelineEntry {
  uint32_t stride = 0;
  ShadowCull cull = ShadowCull::kFront;
  /** Variante com a matriz por instância (SPEC-0289). */
  bool instanced = false;
  /** Variante com recorte alfa (SPEC-0642) e o passo do buffer de UV dela. */
  bool alphaClip = false;
  uint32_t uvStride = 0;
  WGPURenderPipeline pipeline = nullptr;
};

/** Recursos do passe, criados uma vez e reusados entre frames. */
struct Recursos {
  /**
   * Pipelines por (passo, cull). São poucos por construção: três `cullMode`
   * possíveis vezes os poucos passos de vértice da cena — e criar um por frame
   * é o que este cache existe para impedir, porque compilar shader no driver
   * custa muito mais que o marco inteiro ganha.
   */
  std::vector<PipelineEntry> pipelines;
  WGPUBindGroupLayout bindGroupLayout = nullptr;
  WGPUBindGroup bindGroup = nullptr;
  WGPUBuffer uniformes = nullptr;
  uint32_t slots = 0;
  WGPUTextureFormat formatoProfundidade = WGPUTextureFormat_Undefined;
};

/** Tradução do enum puro (testável sem wgpu) para o do WebGPU. */
WGPUCullMode paraWgpu(ShadowCull cull) {
  switch (cull) {
    case ShadowCull::kBack: return WGPUCullMode_Back;
    case ShadowCull::kFront: return WGPUCullMode_Front;
    case ShadowCull::kNone: return WGPUCullMode_None;
  }
  return WGPUCullMode_None;
}

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
 * Layout do bind group, separado do pipeline.
 *
 * Juntá-los fazia o bind group nascer antes do layout quando o passo do
 * vértice mudava, e o wgpu aborta o processo com "invalid bind group layout" —
 * sem exceção, sem chance de tratar (medido no M5, SPEC-0241).
 */
bool garantirBindGroupLayout(HostGpu* gpu, Recursos& r) {
  if (r.bindGroupLayout) return true;

  WGPUBindGroupLayoutEntry entrada = WGPU_BIND_GROUP_LAYOUT_ENTRY_INIT;
  entrada.binding = 0;
  // O fragmento do recorte alfa (SPEC-0642) lê `alphaTest` do mesmo uniforme.
  entrada.visibility = WGPUShaderStage_Vertex | WGPUShaderStage_Fragment;
  entrada.buffer.type = WGPUBufferBindingType_Uniform;
  entrada.buffer.hasDynamicOffset = true;
  entrada.buffer.minBindingSize = sizeof(ShadowCasterUniforms);

  WGPUBindGroupLayoutDescriptor ld = WGPU_BIND_GROUP_LAYOUT_DESCRIPTOR_INIT;
  ld.entryCount = 1;
  ld.entries = &entrada;
  r.bindGroupLayout = wgpuDeviceCreateBindGroupLayout(gpu->device, &ld);
  return r.bindGroupLayout != nullptr;
}

/** Garante buffer de uniformes com espaço para `necessarios` casters. */
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
  entrada.size = sizeof(ShadowCasterUniforms);

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

/**
 * Devolve o pipeline de (formato, passo, cull), criando-o só na primeira vez.
 *
 * Um formato de profundidade novo descarta TODOS os pipelines: eles carregam o
 * formato no descritor, e usar um pipeline de outro formato é erro de
 * validação — que no wgpu aborta o processo, sem exceção (medido no M5).
 */
WGPURenderPipeline garantirPipeline(HostGpu* gpu, Recursos& r, WGPUTextureFormat profundidade,
                                    uint32_t stride, ShadowCull cull, bool instanced,
                                    bool alphaClip, uint32_t uvStride) {
  if (r.formatoProfundidade != profundidade) {
    for (PipelineEntry& entrada : r.pipelines) {
      if (entrada.pipeline) wgpuRenderPipelineRelease(entrada.pipeline);
    }
    r.pipelines.clear();
    r.formatoProfundidade = profundidade;
  }
  for (const PipelineEntry& entrada : r.pipelines) {
    if (entrada.stride == stride && entrada.cull == cull && entrada.instanced == instanced &&
        entrada.alphaClip == alphaClip && entrada.uvStride == uvStride) {
      return entrada.pipeline;
    }
  }
  if (!garantirBindGroupLayout(gpu, r)) return nullptr;
  WGPUBindGroupLayout grupos[kGruposComRecorte] = {r.bindGroupLayout, nullptr};
  if (alphaClip) {
    grupos[kGrupoRecorte] = alphaClipStore().layout(gpu);
    if (!grupos[kGrupoRecorte]) return nullptr;
  }

  WGPUPipelineLayoutDescriptor pld = WGPU_PIPELINE_LAYOUT_DESCRIPTOR_INIT;
  pld.bindGroupLayoutCount = alphaClip ? kGruposComRecorte : kGruposSimples;
  pld.bindGroupLayouts = grupos;
  WGPUPipelineLayout layout = wgpuDeviceCreatePipelineLayout(gpu->device, &pld);
  if (!layout) return nullptr;

  WGPUShaderSourceWGSL wgsl = WGPU_SHADER_SOURCE_WGSL_INIT;
  const char* fonte = alphaClip ? (instanced ? kShaderSombraInstanciadaRecorte : kShaderSombraRecorte)
                                : (instanced ? kShaderSombraInstanciada : kShaderSombra);
  wgsl.code = WGPUStringView{fonte, std::strlen(fonte)};
  WGPUShaderModuleDescriptor sd = WGPU_SHADER_MODULE_DESCRIPTOR_INIT;
  sd.nextInChain = &wgsl.chain;
  WGPUShaderModule modulo = wgpuDeviceCreateShaderModule(gpu->device, &sd);
  if (!modulo) {
    wgpuPipelineLayoutRelease(layout);
    return nullptr;
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

  WGPUVertexAttribute colunas[kInstanceColumns];
  for (uint32_t c = 0; c < kInstanceColumns; ++c) {
    colunas[c] = WGPU_VERTEX_ATTRIBUTE_INIT;
    colunas[c].format = WGPUVertexFormat_Float32x4;
    colunas[c].offset = c * kInstanceColumnBytes;
    colunas[c].shaderLocation = kInstanceFirstLocation + c;
  }
  WGPUVertexBufferLayout layouts[kVertexBuffersInstanciados + 1] = {
      vbl, WGPU_VERTEX_BUFFER_LAYOUT_INIT, WGPU_VERTEX_BUFFER_LAYOUT_INIT};
  layouts[kInstanceBufferSlot].arrayStride = kInstanceStrideBytes;
  layouts[kInstanceBufferSlot].stepMode = WGPUVertexStepMode_Instance;
  layouts[kInstanceBufferSlot].attributeCount = kInstanceColumns;
  layouts[kInstanceBufferSlot].attributes = colunas;
  // UV do recorte (SPEC-0642): buffer próprio, depois da posição e das instâncias.
  // O deslocamento do UV no bloco vai no `setVertexBuffer`, então o atributo fica em 0.
  WGPUVertexAttribute atributoUv = WGPU_VERTEX_ATTRIBUTE_INIT;
  atributoUv.format = WGPUVertexFormat_Float32x2;
  atributoUv.shaderLocation = kUvLocation;
  uint32_t buffers = instanced ? kVertexBuffersInstanciados : kVertexBuffersSimples;
  if (alphaClip) {
    layouts[buffers].arrayStride = uvStride;
    layouts[buffers].stepMode = WGPUVertexStepMode_Vertex;
    layouts[buffers].attributeCount = 1;
    layouts[buffers].attributes = &atributoUv;
    ++buffers;
  }

  WGPUDepthStencilState ds = WGPU_DEPTH_STENCIL_STATE_INIT;
  ds.format = profundidade;
  ds.depthWriteEnabled = WGPUOptionalBool_True;
  ds.depthCompare = WGPUCompareFunction_Less;

  WGPURenderPipelineDescriptor pd = WGPU_RENDER_PIPELINE_DESCRIPTOR_INIT;
  pd.layout = layout;
  pd.vertex.module = modulo;
  pd.vertex.entryPoint = WGPUStringView{"vs", 2};
  pd.vertex.bufferCount = buffers;
  pd.vertex.buffers = layouts;
  pd.primitive.topology = WGPUPrimitiveTopology_TriangleList;
  pd.primitive.frontFace = WGPUFrontFace_CCW;
  // Vem do MATERIAL, já com a inversão do `three` aplicada no JS (ver
  // `shadowCullMode`): `Front` para um caster `FrontSide` (o caso comum, em
  // que a profundidade tem de vir da face de trás, senão dá acne e
  // peter-panning), `Back` para `BackSide` e `None` para `DoubleSide`, que o
  // `three` desenha sem culling nenhum.
  pd.primitive.cullMode = paraWgpu(cull);
  // Depth-only: sem fragmento, salvo o recorte alfa, que só descarta (sem alvo de cor).
  WGPUFragmentState fragmento = WGPU_FRAGMENT_STATE_INIT;
  fragmento.module = modulo;
  fragmento.entryPoint = WGPUStringView{"fs", 2};
  fragmento.targetCount = 0;
  pd.fragment = alphaClip ? &fragmento : nullptr;
  pd.depthStencil = &ds;
  pd.multisample.count = kAmostras;

  WGPURenderPipeline pipeline = wgpuDeviceCreateRenderPipeline(gpu->device, &pd);
  wgpuShaderModuleRelease(modulo);
  wgpuPipelineLayoutRelease(layout);
  if (!pipeline) return nullptr;

  r.pipelines.push_back(PipelineEntry{stride, cull, instanced, alphaClip, uvStride, pipeline});
  return pipeline;
}

}  // namespace

uint32_t drawShadowCasters(HostGpu* gpu, WGPUTexture alvoProfundidade,
                           const double viewProjection[16], const ShadowDrawItem* itens,
                           uint32_t total, const double* projection, const double* view) {
  if (!gpu || !gpu->device || !gpu->queue || !alvoProfundidade || !viewProjection) return 0;
  if (total == 0 || !itens) return 0;

  Recursos& r = recursos();
  const WGPUTextureFormat formatoProf = wgpuTextureGetFormat(alvoProfundidade);
  if (!garantirBindGroupLayout(gpu, r)) return 0;
  if (!garantirUniformes(gpu, r, total)) return 0;

  const GeometryRegistry& registro = shims::geometryRegistry();

  struct Pronto {
    const GeometryEntry* geometria;
    uint32_t slot;
    ShadowCull cull;
    WGPUBuffer instancias;
    uint32_t quantas;
    const AlphaClipEntry* recorte;
  };
  std::vector<Pronto> prontos;
  prontos.reserve(total);

  ShadowCasterUniforms u = {};
  for (uint32_t i = 0; i < total; ++i) {
    const GeometryEntry* geometria = registro.find(itens[i].geometryId);
    if (!geometria) continue;  // pula: nunca aproxima
    if (itens[i].instanceCount == 0) continue;  // lote vazio: nada a desenhar
    shadowCasterMatrices(viewProjection, projection, view, itens[i].model, u.matrices);
    const AlphaClipEntry* recorte = itens[i].alphaClip;
    u.alphaTest = recorte ? recorte->alphaTest : 0.0f;
    for (uint32_t c = 0; c < kUvColumns; ++c) {
      for (uint32_t l = 0; l < kUvRows; ++l) {
        u.uvTransform[c * kUvColumnFloats + l] =
            recorte ? recorte->uvTransform[c * kUvRows + l] : 0.0f;
      }
    }
    const uint32_t slot = static_cast<uint32_t>(prontos.size());
    wgpuQueueWriteBuffer(gpu->queue, r.uniformes, slot * kUniformSlotAlign, &u, sizeof(u));
    prontos.push_back({geometria, slot, itens[i].cullMode, itens[i].instanceBuffer,
                       itens[i].instanceCount, recorte});
  }
  if (prontos.empty()) return 0;

  // Agrupa por (cull, passo do vértice) — as duas coisas que entram no
  // pipeline — para trocar de pipeline o mínimo possível. O cull vem primeiro
  // porque ele tem três valores e o passo tem mais, então a ordem dá lotes
  // maiores.
  //
  // Note que NÃO há ordenação por profundidade: o passe é depth-only e a ordem
  // não tem efeito visual nenhum — é justamente o trabalho que o `three` paga
  // à toa (`sortObjects` default, SPEC-0245).
  std::stable_sort(prontos.begin(), prontos.end(), [](const Pronto& a, const Pronto& b) {
    if (a.cull != b.cull) return a.cull < b.cull;
    if ((a.instancias != nullptr) != (b.instancias != nullptr)) return a.instancias == nullptr;
    if ((a.recorte != nullptr) != (b.recorte != nullptr)) return a.recorte == nullptr;
    if (a.recorte && a.recorte->uvStride != b.recorte->uvStride) {
      return a.recorte->uvStride < b.recorte->uvStride;
    }
    return a.geometria->vertexStride < b.geometria->vertexStride;
  });

  // View criada e liberada por chamada, de propósito: a textura é recriada
  // quando o `mapSize` muda, e uma view cacheada apontaria para o recurso
  // morto. O custo é de microssegundos contra os milissegundos do marco.
  WGPUTextureView viewProf = wgpuTextureCreateView(alvoProfundidade, nullptr);
  if (!viewProf) return 0;

  WGPURenderPassDepthStencilAttachment prof =
      WGPU_RENDER_PASS_DEPTH_STENCIL_ATTACHMENT_INIT;
  prof.view = viewProf;
  prof.depthLoadOp = WGPULoadOp_Clear;
  prof.depthClearValue = kDepthClearValue;
  prof.depthStoreOp = WGPUStoreOp_Store;

  WGPURenderPassDescriptor rp = WGPU_RENDER_PASS_DESCRIPTOR_INIT;
  // Depth-only: nenhum attachment de cor.
  rp.colorAttachmentCount = 0;
  rp.colorAttachments = nullptr;
  rp.depthStencilAttachment = &prof;
  rp.timestampWrites = webgpu::nextPassTimestampWrites(webgpu::PassOrigin::Shadow);

  WGPUCommandEncoderDescriptor ed = WGPU_COMMAND_ENCODER_DESCRIPTOR_INIT;
  WGPUCommandEncoder encoder = wgpuDeviceCreateCommandEncoder(gpu->device, &ed);
  WGPURenderPassEncoder pass = wgpuCommandEncoderBeginRenderPass(encoder, &rp);

  uint32_t desenhados = 0;
  uint32_t strideAtual = 0;
  ShadowCull cullAtual = ShadowCull::kNone;
  bool instanciadoAtual = false;
  bool recorteAtual = false;
  uint32_t uvStrideAtual = 0;
  // Flag explícita em vez de confiar num par impossível de (passo, cull): o
  // primeiro item SEMPRE precisa de `setPipeline`, e deduzir isso de valores
  // iniciais é o tipo de armadilha que dá uma pass sem pipeline — e aí o wgpu
  // aborta o processo.
  bool primeiro = true;
  for (const Pronto& item : prontos) {
    const bool instanciado = item.instancias != nullptr;
    const bool comRecorte = item.recorte != nullptr;
    const uint32_t uvStride = comRecorte ? item.recorte->uvStride : 0;
    if (primeiro || item.geometria->vertexStride != strideAtual || item.cull != cullAtual ||
        instanciado != instanciadoAtual || comRecorte != recorteAtual ||
        uvStride != uvStrideAtual) {
      primeiro = false;
      strideAtual = item.geometria->vertexStride;
      cullAtual = item.cull;
      instanciadoAtual = instanciado;
      recorteAtual = comRecorte;
      uvStrideAtual = uvStride;
      WGPURenderPipeline pipeline = garantirPipeline(gpu, r, formatoProf, strideAtual, cullAtual,
                                                     instanciadoAtual, recorteAtual, uvStrideAtual);
      if (!pipeline) break;
      wgpuRenderPassEncoderSetPipeline(pass, pipeline);
    }
    const uint32_t offset = item.slot * static_cast<uint32_t>(kUniformSlotAlign);
    wgpuRenderPassEncoderSetBindGroup(pass, 0, r.bindGroup, 1, &offset);
    wgpuRenderPassEncoderSetVertexBuffer(pass, 0, item.geometria->vertexBuffer,
                                         item.geometria->vertexOffset, WGPU_WHOLE_SIZE);
    if (instanciado) {
      wgpuRenderPassEncoderSetVertexBuffer(pass, kInstanceBufferSlot, item.instancias, 0,
                                           static_cast<uint64_t>(item.quantas) *
                                               kInstanceStrideBytes);
    }
    if (comRecorte) {
      wgpuRenderPassEncoderSetBindGroup(pass, kGrupoRecorte, item.recorte->bindGroup, 0, nullptr);
      const uint32_t slotUv = instanciado ? kVertexBuffersInstanciados : kVertexBuffersSimples;
      wgpuRenderPassEncoderSetVertexBuffer(pass, slotUv, item.recorte->uvBuffer,
                                           item.recorte->uvOffset, WGPU_WHOLE_SIZE);
    }
    if (item.geometria->indexBuffer) {
      const WGPUIndexFormat formatoIndice =
          item.geometria->indexIs32Bit ? WGPUIndexFormat_Uint32 : WGPUIndexFormat_Uint16;
      wgpuRenderPassEncoderSetIndexBuffer(pass, item.geometria->indexBuffer, formatoIndice, 0,
                                          WGPU_WHOLE_SIZE);
      wgpuRenderPassEncoderDrawIndexed(pass, item.geometria->indexCount, item.quantas, 0, 0, 0);
    } else {
      wgpuRenderPassEncoderDraw(pass, item.geometria->vertexCount, item.quantas, 0, 0);
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
  wgpuTextureViewRelease(viewProf);

  static const bool logar = std::getenv("CORTEX_SHADOW_PASS_LOG") != nullptr;
  static int vezes = 0;
  constexpr int kMaxVezesLogadas = 8;
  if (logar && vezes < kMaxVezesLogadas) {
    ++vezes;
    std::fprintf(stderr, "[shadow-pass] alvo=%p %ux%u fmt=%d itens=%u desenhados=%u",
                 (void*)alvoProfundidade, wgpuTextureGetWidth(alvoProfundidade),
                 wgpuTextureGetHeight(alvoProfundidade), (int)formatoProf, total, desenhados);
    std::fputc(0x0A, stderr);
    std::fflush(stderr);
  }
  return desenhados;
}

}  // namespace render
