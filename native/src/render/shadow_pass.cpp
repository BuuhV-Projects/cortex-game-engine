// Ver shadow_pass.h (SPEC-0245, E5 do passo 2).
#include "shadow_pass.h"

#include "../core/host_gpu.h"
#include "../shims/geometry_registry_shim.h"
#include "geometry_registry.h"
#include "instance_buffer_store.h"
#include "shadow_math.h"
#include "shadow_pass_shaders.h"
#include "shadow_pass_target.h"
#include "shadow_pass_timing.h"
#include "shadow_pass_uniforms.h"

#include <webgpu/wgpu.h>

#include <algorithm>
#include <cstring>
#include <vector>

namespace render {
namespace {

/** Slots pré-alocados; cresce conforme a cena pedir. */
constexpr uint32_t kSlotsIniciais = 256;
/** Passo padrão quando a geometria é densa (3 floats de posição). */
constexpr uint64_t kVertexStridePadrao = 3 * sizeof(float);
/** Uma amostra: o shadow map do `three` não é multiamostrado. */
constexpr uint32_t kAmostras = 1;
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
  /** Uniformes da cascata em montagem, mandados numa escrita só (reaproveitado entre chamadas). */
  ShadowUniformStaging staging;
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

/** Um caster que passou na contagem: a geometria do registro e o slot de uniforme. */
struct Pronto {
  const GeometryEntry* geometria;
  const ShadowDrawItem* item;
  uint32_t slot;
  WGPURenderPipeline pipeline;
};

/** Termina sem desenho: relata e devolve `status` com 0 desenhados. */
ShadowPassResult semDesenho(WGPUTexture alvo, uint32_t total, ShadowPassStatus status) {
  logShadowPass(alvo, total, 0, static_cast<int>(status));
  return ShadowPassResult{0, status};
}

/** Escreve o uniforme do caster no slot dele (matrizes + recorte alfa). */
/** Monta o uniforme do caster no staging, no slot dele (a escrita na fila é uma só, antes do 1º draw). */
void montarUniforme(Recursos& r, const Pronto& p, const double viewProjection[16], const double* projection,
                    const double* view) {
  composeShadowUniform(r.staging.at(p.slot), viewProjection, projection, view, p.item->model, p.item->alphaClip);
}

/** Manda os uniformes montados da cascata numa `wgpuQueueWriteBuffer` só (slots 0..n-1 contíguos). */
void mandarUniformes(HostGpu* gpu, Recursos& r) {
  if (r.staging.used() == 0) return;
  wgpuQueueWriteBuffer(gpu->queue, r.uniformes, 0, r.staging.data(), r.staging.bytes());
  r.staging.reset();
}

/** Os dois casters caem no mesmo pipeline (passo, cull, instância, recorte e passo do UV)? */
bool mesmoPipeline(const Pronto& a, const Pronto& b) {
  const ShadowDrawItem& x = *a.item;
  const ShadowDrawItem& y = *b.item;
  const uint32_t uvX = x.alphaClip ? x.alphaClip->uvStride : 0;
  const uint32_t uvY = y.alphaClip ? y.alphaClip->uvStride : 0;
  return a.geometria->vertexStride == b.geometria->vertexStride && x.cullMode == y.cullMode &&
         (x.instanceBuffer != nullptr) == (y.instanceBuffer != nullptr) &&
         (x.alphaClip != nullptr) == (y.alphaClip != nullptr) && uvX == uvY;
}

/** Grava o draw de um caster no pass aberto; troca de pipeline só quando muda. */
void desenharUm(const ShadowDepthPass& aberto, const Recursos& r, const Pronto& p,
                WGPURenderPipeline& atual) {
  const ShadowDrawItem& it = *p.item;
  const bool instanciado = it.instanceBuffer != nullptr;
  if (p.pipeline != atual) {
    atual = p.pipeline;
    wgpuRenderPassEncoderSetPipeline(aberto.pass, atual);
  }
  const uint32_t offset = p.slot * static_cast<uint32_t>(kUniformSlotAlign);
  wgpuRenderPassEncoderSetBindGroup(aberto.pass, 0, r.bindGroup, 1, &offset);
  wgpuRenderPassEncoderSetVertexBuffer(aberto.pass, 0, p.geometria->vertexBuffer,
                                       p.geometria->vertexOffset, WGPU_WHOLE_SIZE);
  if (instanciado) {
    wgpuRenderPassEncoderSetVertexBuffer(
        aberto.pass, kInstanceBufferSlot, it.instanceBuffer, 0,
        static_cast<uint64_t>(it.instanceCount) * kInstanceStrideBytes);
  }
  if (it.alphaClip) {
    wgpuRenderPassEncoderSetBindGroup(aberto.pass, kGrupoRecorte, it.alphaClip->bindGroup, 0,
                                      nullptr);
    const uint32_t slotUv = instanciado ? kVertexBuffersInstanciados : kVertexBuffersSimples;
    wgpuRenderPassEncoderSetVertexBuffer(aberto.pass, slotUv, it.alphaClip->uvBuffer,
                                         it.alphaClip->uvOffset, WGPU_WHOLE_SIZE);
  }
  if (p.geometria->indexBuffer) {
    const WGPUIndexFormat formatoIndice =
        p.geometria->indexIs32Bit ? WGPUIndexFormat_Uint32 : WGPUIndexFormat_Uint16;
    wgpuRenderPassEncoderSetIndexBuffer(aberto.pass, p.geometria->indexBuffer, formatoIndice, 0,
                                        WGPU_WHOLE_SIZE);
    wgpuRenderPassEncoderDrawIndexed(aberto.pass, p.geometria->indexCount, it.instanceCount, 0,
                                     0, 0);
  } else {
    wgpuRenderPassEncoderDraw(aberto.pass, p.geometria->vertexCount, it.instanceCount, 0, 0);
  }
}

}  // namespace

ShadowPassResult drawShadowCasters(HostGpu* gpu, WGPUTexture alvoProfundidade,
                                   const double viewProjection[16], const ShadowDrawItem* itens,
                                   uint32_t total, const double* projection, const double* view) {
  if (!gpu || !gpu->device || !gpu->queue || !alvoProfundidade || !viewProjection ||
      (total > 0 && !itens)) {
    return ShadowPassResult{0, ShadowPassStatus::kNotReady};
  }

  // Primeiro só CONTA (SPEC-0690): o status sai antes de qualquer escrita na
  // fila, porque `kNotReady` não pode tocar no alvo.
  const GeometryRegistry& registro = shims::geometryRegistry();
  uint32_t semGeometria = 0;
  uint32_t vazios = 0;
  std::vector<uint32_t> instancias(total);
  for (uint32_t i = 0; i < total; ++i) {
    instancias[i] = itens[i].instanceCount;
    if (!registro.find(itens[i].geometryId)) {
      ++semGeometria;
    } else if (itens[i].instanceCount == 0) {
      ++vazios;  // lote vazio: legítimo, só não desenha
    }
  }
  const ShadowPassStatus status = classifyShadowPass(total, semGeometria, vazios);
  if (status == ShadowPassStatus::kClearedEmpty) {
    // Cascata vazia é LIMPA: sem isso a sombra do quadro anterior ficaria no mapa.
    const bool limpou = clearShadowDepthTarget(gpu, alvoProfundidade);
    return semDesenho(alvoProfundidade, total,
                      limpou ? ShadowPassStatus::kClearedEmpty : ShadowPassStatus::kNotReady);
  }
  if (status != ShadowPassStatus::kOk) return semDesenho(alvoProfundidade, total, status);

  Recursos& r = recursos();
  const WGPUTextureFormat formatoProf = wgpuTextureGetFormat(alvoProfundidade);
  if (!garantirBindGroupLayout(gpu, r) || !garantirUniformes(gpu, r, total)) {
    return semDesenho(alvoProfundidade, total, ShadowPassStatus::kNotReady);
  }

  // Slots 0..n-1 desta chamada (a mesma função que o harness confere).
  std::vector<uint32_t> slots;
  std::vector<Pronto> prontos;
  prontos.reserve(assignShadowSlots(instancias.data(), total, slots));
  for (uint32_t i = 0; i < total; ++i) {
    if (slots[i] == kNoShadowSlot) continue;
    prontos.push_back({registro.find(itens[i].geometryId), &itens[i], slots[i], nullptr});
  }

  // Agrupa por (cull, passo do vértice) — o que entra no pipeline — para trocar
  // de pipeline o mínimo possível (o cull, de três valores, primeiro: lotes
  // maiores). NÃO há ordenação por profundidade: o passe é depth-only e a ordem
  // não tem efeito visual — é o que o `three` paga à toa (`sortObjects`, SPEC-0245).
  std::stable_sort(prontos.begin(), prontos.end(), [](const Pronto& a, const Pronto& b) {
    const ShadowDrawItem& x = *a.item;
    const ShadowDrawItem& y = *b.item;
    if (x.cullMode != y.cullMode) return x.cullMode < y.cullMode;
    if ((x.instanceBuffer != nullptr) != (y.instanceBuffer != nullptr)) {
      return x.instanceBuffer == nullptr;
    }
    if ((x.alphaClip != nullptr) != (y.alphaClip != nullptr)) return x.alphaClip == nullptr;
    if (x.alphaClip && x.alphaClip->uvStride != y.alphaClip->uvStride) {
      return x.alphaClip->uvStride < y.alphaClip->uvStride;
    }
    return a.geometria->vertexStride < b.geometria->vertexStride;
  });

  // Pipelines ANTES do pass (SPEC-0690): um que falhasse no meio deixava um
  // mapa com parte dos casters, que é sombra faltando. Falhou, nada é submetido.
  const Pronto* chave = nullptr;
  for (Pronto& p : prontos) {
    if (chave && mesmoPipeline(*chave, p)) {
      p.pipeline = chave->pipeline;
      continue;
    }
    const ShadowDrawItem& it = *p.item;
    p.pipeline = garantirPipeline(gpu, r, formatoProf, p.geometria->vertexStride, it.cullMode,
                                  it.instanceBuffer != nullptr, it.alphaClip != nullptr,
                                  it.alphaClip ? it.alphaClip->uvStride : 0);
    if (!p.pipeline) return semDesenho(alvoProfundidade, total, ShadowPassStatus::kNotReady);
    chave = &p;
  }

  // Segue o roteiro puro (`planShadowPass`): a próxima cascata reaproveita os
  // slots, então nenhuma escrita de uniforme cai depois do submit desta.
  r.staging.reset();
  ShadowPassTiming::instance().mark(ShadowPhase::kPrepare);
  ShadowDepthPass aberto;
  size_t escritos = 0;
  uint32_t desenhados = 0;
  // Começa em `nullptr`, que nenhum `Pronto` tem: o primeiro item SEMPRE faz
  // `setPipeline` — uma pass sem pipeline faz o wgpu abortar o processo.
  WGPURenderPipeline atual = nullptr;
  const auto plano = planShadowPass(ShadowPassStatus::kOk, static_cast<uint32_t>(prontos.size()));
  for (const ShadowPassStep passo : plano) {
    switch (passo) {
      case ShadowPassStep::kOpen:
        if (!openShadowDepthPass(gpu, alvoProfundidade, aberto)) {
          return semDesenho(alvoProfundidade, total, ShadowPassStatus::kNotReady);
        }
        break;
      case ShadowPassStep::kWriteUniform:
        montarUniforme(r, prontos[escritos++], viewProjection, projection, view);
        break;
      case ShadowPassStep::kDraw:
        if (desenhados == 0) mandarUniformes(gpu, r);
        desenharUm(aberto, r, prontos[desenhados++], atual);
        break;
      case ShadowPassStep::kSubmit:
        ShadowPassTiming::instance().mark(ShadowPhase::kEncode);
        submitShadowDepthPass(gpu, aberto);
        ShadowPassTiming::instance().mark(ShadowPhase::kSubmit);
        break;
    }
  }

  logShadowPass(alvoProfundidade, total, desenhados, static_cast<int>(ShadowPassStatus::kOk));
  return ShadowPassResult{desenhados, ShadowPassStatus::kOk};
}

}  // namespace render
