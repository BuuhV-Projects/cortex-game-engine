// Ver scene_mirror_shim.h (SPEC-0234).
#include "scene_mirror_shim.h"

#include <cstdint>
#include <cstring>
#include <vector>

#include "../core/host_gpu.h"
#include "../napi/napi_util.h"
#include "../render/shadow_pass.h"
#include "../scene/scene_mirror.h"
#include "../scene/shadow_caster_enumerator.h"
#include "../scene/shadow_pass_gate.h"
#include "../render/geometry_registry.h"
#include "geometry_registry_shim.h"

namespace shims {
namespace {

/**
 * Floats que descrevem um nó no buffer de construção.
 *
 * Cresceu de 14 para 20 no M6 (SPEC-0245): enumerar casters em C++ exige
 * `flags`, `geometryId` e a esfera local, que o espelho não guardava. O slot
 * que sobrava no fim virou o `material.visible` inicial no E3 do passo 2 — o
 * valor por frame chega pelo buffer de sincronização, mas o `build` precisa de
 * um estado de partida, senão o primeiro frame enumera por um default. O 21º
 * é o lado da face do passe de sombra, pelo mesmo motivo.
 */
constexpr int kBuildFloatsPerNode = 21;
/** Posições do layout de construção (ver {@link jsBuild}). */
constexpr int kBuildFlags = 13;
constexpr int kBuildGeometryId = 14;
constexpr int kBuildBoundsCenter = 15;
constexpr int kBuildBoundsRadius = 18;
constexpr int kBuildMaterialVisible = 19;
/** Lado da face do passe de sombra INICIAL (ver `scene::ShadowSide`). */
constexpr int kBuildShadowSide = 20;
/** Floats do frustum: 6 planos de 4. */
constexpr int kFrustumFloats = scene::kFrustumPlanes * 4;

/**
 * Layout do vetor de saída do gate (ver {@link jsDrawShadowPass}).
 *
 * O gate roda por frame, então ele ESCREVE num buffer que o JS já tem em vez
 * de devolver um objeto novo: criar um `napi_value` por frame para relatar um
 * veredito seria gastar em alocação o que o marco quer ganhar em submissão.
 */
constexpr int kGateOutRefusedCasters = scene::kShadowGateRefusalCount;
constexpr int kGateOutTotalCasters = scene::kShadowGateRefusalCount + 1;
constexpr int kGateOutFloats = scene::kShadowGateRefusalCount + 2;
/** Argumentos de `drawShadowPass` (ver {@link jsDrawShadowPass}). */
constexpr size_t kArgsDrawShadowPass = 10;
/** Elementos de uma matriz 4x4. */
constexpr size_t kMatrixElements = 16;

/** GPU do host, para o passe de sombra nativo (SPEC-0245, E5). */
HostGpu* g_gpu = nullptr;

/**
 * Códigos de erro de `appendNodes` (ver {@link jsAppendNodes}).
 *
 * Negativos porque o caso bom devolve quantos nós entraram. Estouro NÃO
 * realoca — quem chama tem de invalidar os `matrixWorld` e devolver o passe ao
 * `three` (SPEC-0245, E6).
 */
constexpr int kAppendErrorCapacity = -1;
constexpr int kAppendErrorParent = -2;
constexpr int kAppendErrorArgs = -3;
/** Argumentos de `appendNodes`: a descrição e o vetor de saída dos índices. */
constexpr size_t kArgsAppendNodes = 2;

/**
 * Consulta ao registro de geometria, na forma que o gate PURO aceita.
 *
 * O `GeometryRegistry` arrasta `webgpu.h`; o gate não pode vê-lo sem sair do
 * harness. Este adaptador mora aqui, que é onde os dois mundos já se encontram.
 */
bool geometriaRegistrada(int32_t geometryId, void*) {
  if (geometryId < 0) return false;
  return geometryRegistry().find(static_cast<uint32_t>(geometryId)) != nullptr;
}

/**
 * Estado do espelho, um por processo.
 *
 * Vive em `static` e não em `napi_env` porque o host tem um runtime só e a cena
 * é única — e porque o `ArrayBuffer` externo que o JS segura aponta para a
 * memória daqui: ela precisa durar mais que qualquer escopo de callback.
 */
struct MirrorState {
  scene::SceneMirror mirror;
  /** Enumerador do passe de sombra (SPEC-0245); guarda os buffers entre frames. */
  scene::ShadowCasterEnumerator shadowCasters;
  /** Transforms que o JS escreve por frame (só os nós dinâmicos), em dupla. */
  std::vector<double> syncBuffer;
  /**
   * Lote do passe de sombra, reusado entre frames.
   *
   * Vive aqui, e não na pilha da chamada, pelo motivo de sempre nesta série:
   * alocar por frame devolveria em malloc parte do que o marco ganha em
   * submissão.
   */
  std::vector<render::ShadowDrawItem> shadowItems;
  bool built = false;
};

MirrorState& state() {
  static MirrorState instance;
  return instance;
}

/**
 * Lê uma linha do layout de construção (20 floats) num {@link scene::NodeDesc}.
 *
 * Mora aqui porque o `build` e o `appendNodes` falam o MESMO layout: um nó que
 * nasce depois do `install` tem de ser descrito exatamente como os que nasceram
 * com ela, senão o gate passaria a julgar dois vocabulários diferentes.
 */
scene::NodeDesc lerNo(const float* row) {
  scene::NodeDesc node;
  node.parent = static_cast<scene::NodeIndex>(row[0]);
  node.transform.px = row[1];
  node.transform.py = row[2];
  node.transform.pz = row[3];
  node.transform.qx = row[4];
  node.transform.qy = row[5];
  node.transform.qz = row[6];
  node.transform.qw = row[7];
  node.transform.sx = row[8];
  node.transform.sy = row[9];
  node.transform.sz = row[10];
  node.radius = row[11];
  node.visible = row[12] != 0.0f;
  node.flags = static_cast<uint16_t>(row[kBuildFlags]);
  node.geometryId = static_cast<int32_t>(row[kBuildGeometryId]);
  node.bounds.cx = row[kBuildBoundsCenter];
  node.bounds.cy = row[kBuildBoundsCenter + 1];
  node.bounds.cz = row[kBuildBoundsCenter + 2];
  node.bounds.radius = row[kBuildBoundsRadius];
  node.materialVisible = row[kBuildMaterialVisible] != 0.0f;
  node.shadowSide = static_cast<uint8_t>(row[kBuildShadowSide]);
  return node;
}

/**
 * `build(descricao: Float32Array)` — recebe a cena inteira uma vez.
 *
 * Layout por nó (21 floats): pai, px, py, pz, qx, qy, qz, qw, sx, sy, sz,
 * raio, visível, flags, geometryId, bcx, bcy, bcz, braio, materialVisível,
 * ladoDaSombra.
 */
napi_value jsBuild(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value args[2];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  if (argc < 1) { napi_value out; napi_get_boolean(env, false, &out); return out; }

  void* data = nullptr;
  size_t byteLength = 0;
  napi_typedarray_type type;
  size_t length = 0;
  napi_value arrayBuffer;
  size_t offset = 0;
  if (napi_get_typedarray_info(env, args[0], &type, &length, &data, &arrayBuffer, &offset) != napi_ok ||
      data == nullptr) {
    { napi_value out; napi_get_boolean(env, false, &out); return out; }
  }
  byteLength = length * sizeof(float);
  (void)byteLength;

  const auto* floats = static_cast<const float*>(data);
  const size_t nodeCount = length / kBuildFloatsPerNode;
  std::vector<scene::NodeDesc> nodes(nodeCount);
  for (size_t i = 0; i < nodeCount; i++) nodes[i] = lerNo(floats + i * kBuildFloatsPerNode);

  MirrorState& s = state();
  s.built = s.mirror.build(nodes);
  // Espaço para o pior caso: todos os nós mudando num frame — e pela
  // CAPACIDADE, não pelo tamanho de agora, porque este buffer também é externo
  // e o JS o segura desde o `install`. Redimensioná-lo depois realocaria a
  // memória que o `Float64Array` do JS já aponta.
  s.syncBuffer.assign(s.mirror.capacity() * scene::kSyncFloatsPerNode, 0.0);
  { napi_value out; napi_get_boolean(env, s.built, &out); return out; }
}

/**
 * `worldMatrices()` — as matrizes de mundo como `Float32Array` **externo**,
 * sem cópia. O JS aponta o `matrixWorld.elements` de cada objeto para a fatia
 * dele; a partir daí o `three` lê o que o C++ escreveu, sem laço por frame.
 */
napi_value jsWorldMatrices(napi_env env, napi_callback_info) {
  MirrorState& s = state();
  if (!s.built) return njs::undefined(env);
  // Pela CAPACIDADE: o JS recebe este buffer uma vez, no `install`, e precisa
  // poder fatiar o slot de um nó que ainda vai nascer. A memória já está
  // alocada pela reserva do `build`.
  const size_t elementCount = s.mirror.worldCapacityElements();
  napi_value buffer;
  // Sem finalizer: a memória é do `SceneMirror`, que vive enquanto o processo
  // viver. Liberar aqui soltaria memória que o C++ ainda usa.
  if (napi_create_external_arraybuffer(env, s.mirror.worldData(), elementCount * sizeof(double), nullptr,
                                       nullptr, &buffer) != napi_ok) {
    return njs::undefined(env);
  }
  napi_value typed;
  if (napi_create_typedarray(env, napi_float64_array, elementCount, buffer, 0, &typed) != napi_ok) {
    return njs::undefined(env);
  }
  return typed;
}

/**
 * `syncBuffer()` — o buffer onde o JS escreve os transforms dos nós dinâmicos,
 * também externo. Escrever aqui não cruza a ponte; só o `update` cruza.
 */
napi_value jsSyncBuffer(napi_env env, napi_callback_info) {
  MirrorState& s = state();
  if (!s.built) return njs::undefined(env);
  napi_value buffer;
  if (napi_create_external_arraybuffer(env, s.syncBuffer.data(), s.syncBuffer.size() * sizeof(double),
                                       nullptr, nullptr, &buffer) != napi_ok) {
    return njs::undefined(env);
  }
  napi_value typed;
  if (napi_create_typedarray(env, napi_float64_array, s.syncBuffer.size(), buffer, 0, &typed) != napi_ok) {
    return njs::undefined(env);
  }
  return typed;
}

/**
 * `appendNodes(descricao: Float32Array, saida: Int32Array)` — a cena ganhou
 * uma subárvore depois do `install` (SPEC-0245, E6).
 *
 * Chega a subárvore INTEIRA numa chamada: uma travessia de ponte por evento,
 * não uma por nó (15 us cada, SPEC-0225). O layout é o mesmo do `build`, com o
 * pai dos nós de dentro codificado por posição no lote
 * ({@link scene::encodeBatchParent}).
 *
 * Devolve quantos nós entraram, ou um código negativo. Estouro de capacidade
 * NÃO realoca — é o JS que invalida os `matrixWorld` e devolve o passe ao
 * `three`, porque realocar aqui deixaria todo `elements` já entregue sobre
 * memória liberada.
 */
napi_value jsAppendNodes(napi_env env, napi_callback_info info) {
  size_t argc = kArgsAppendNodes;
  napi_value args[kArgsAppendNodes];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  MirrorState& s = state();
  napi_value out;
  if (!s.built || argc < kArgsAppendNodes) {
    napi_create_double(env, kAppendErrorArgs, &out);
    return out;
  }

  void* data = nullptr;
  napi_typedarray_type type;
  size_t length = 0;
  napi_value arrayBuffer;
  size_t offset = 0;
  void* outData = nullptr;
  size_t outLength = 0;
  if (napi_get_typedarray_info(env, args[0], &type, &length, &data, &arrayBuffer, &offset) != napi_ok ||
      data == nullptr ||
      napi_get_typedarray_info(env, args[1], &type, &outLength, &outData, &arrayBuffer, &offset) !=
          napi_ok ||
      outData == nullptr) {
    napi_create_double(env, kAppendErrorArgs, &out);
    return out;
  }

  const auto* floats = static_cast<const float*>(data);
  const size_t nodeCount = length / kBuildFloatsPerNode;
  if (nodeCount == 0 || outLength < nodeCount) {
    napi_create_double(env, kAppendErrorArgs, &out);
    return out;
  }
  std::vector<scene::NodeDesc> nodes(nodeCount);
  for (size_t i = 0; i < nodeCount; i++) nodes[i] = lerNo(floats + i * kBuildFloatsPerNode);

  std::vector<scene::NodeIndex> indices;
  const scene::AppendResult resultado = s.mirror.appendBatch(nodes, indices);
  if (resultado != scene::AppendResult::kAppended) {
    const int codigo = resultado == scene::AppendResult::kOutOfCapacity ? kAppendErrorCapacity
                                                                       : kAppendErrorParent;
    napi_create_double(env, codigo, &out);
    return out;
  }

  auto* saida = static_cast<int32_t*>(outData);
  for (size_t i = 0; i < indices.size(); i++) saida[i] = indices[i];
  napi_create_double(env, static_cast<double>(indices.size()), &out);
  return out;
}

/**
 * `removeNode(indice)` — a subárvore saiu da cena.
 *
 * Os slots viram lápide NO LUGAR: mudar índice de nó obrigaria a reapontar o
 * `matrixWorld.elements` de todo mundo, que é justamente o laço em JS que a
 * SPEC-0234 eliminou. Devolve quantos nós saíram.
 */
napi_value jsRemoveNode(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  MirrorState& s = state();
  napi_value out;
  if (!s.built || argc < 1) {
    napi_create_double(env, 0, &out);
    return out;
  }
  int32_t index = -1;
  napi_get_value_int32(env, args[0], &index);
  const int32_t saiu = s.mirror.removeSubtree(static_cast<scene::NodeIndex>(index));
  napi_create_double(env, static_cast<double>(saiu), &out);
  return out;
}

/**
 * `update(nosMudados, planos)` — a única travessia de ponte por frame.
 *
 * Aplica os transforms que o JS escreveu no `syncBuffer`, propaga as matrizes
 * de mundo e corta pelo frustum. Devolve quantos nós ficaram visíveis.
 */
napi_value jsUpdate(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value args[2];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  MirrorState& s = state();
  if (!s.built || argc < 2) { napi_value out; napi_create_double(env, static_cast<double>(0), &out); return out; }

  int32_t changed = 0;
  napi_get_value_int32(env, args[0], &changed);
  const size_t floats = static_cast<size_t>(changed) * scene::kSyncFloatsPerNode;
  if (floats > s.syncBuffer.size()) { napi_value out; napi_create_double(env, static_cast<double>(0), &out); return out; }
  s.mirror.applyTransforms(s.syncBuffer.data(), floats);

  void* planeData = nullptr;
  napi_typedarray_type type;
  size_t planeLength = 0;
  napi_value planeBuffer;
  size_t planeOffset = 0;
  if (napi_get_typedarray_info(env, args[1], &type, &planeLength, &planeData, &planeBuffer, &planeOffset) !=
          napi_ok ||
      planeData == nullptr || planeLength < kFrustumFloats) {
    { napi_value out; napi_create_double(env, static_cast<double>(0), &out); return out; }
  }

  // A matriz de view-projection não entra: os planos já vêm em espaço de mundo
  // (o JS os deriva uma vez por frame), e o teste é contra a posição de mundo.
  static const float kIdentity[16] = {1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1};
  const int visible = s.mirror.updateAndCull(kIdentity, static_cast<const float*>(planeData));
  { napi_value out; napi_create_double(env, static_cast<double>(visible), &out); return out; }
}

/**
 * `drawShadowPass(minRatio, camX, camY, camZ, planos, viewProj, alvo,
 * nosDaCena, vsm, saida)` — o passe de sombra NATIVO (SPEC-0245, E5).
 *
 * Faz numa travessia de ponte só o que o `three` faz em JS por objeto:
 * enumera os casters, passa pelo gate e, se ele aceitar, desenha direto na
 * `ShadowDepthTexture` da cascata.
 *
 * `alvo` é o `GPUTexture` do `shadow.map.depthTexture`, identificado do lado
 * do JS por IDENTIDADE do objeto (nunca por dimensão — foi o que custou dois
 * dias no M5) e reaquirido por frame, porque o `three` recria a textura quando
 * o `mapSize` muda.
 *
 * `viewProj` é `Float64Array`, não `Float32Array`: a multiplicação por `model`
 * acontece em `double` no C++ e só o resultado vira `float`. Degradar antes é
 * o caminho conhecido para as bandas da SPEC-0234.
 *
 * @return `>= 0` — casters desenhados; `< 0` — recusado, com o código do
 *   motivo negado. `saida` traz a contagem por motivo nos dois casos.
 */
napi_value jsDrawShadowPass(napi_env env, napi_callback_info info) {
  size_t argc = kArgsDrawShadowPass;
  napi_value args[kArgsDrawShadowPass];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  MirrorState& s = state();
  if (!s.built || argc < kArgsDrawShadowPass) return njs::undefined(env);

  scene::ShadowCasterParams params;
  napi_get_value_double(env, args[0], &params.minRatio);
  napi_get_value_double(env, args[1], &params.cameraX);
  napi_get_value_double(env, args[2], &params.cameraY);
  napi_get_value_double(env, args[3], &params.cameraZ);

  napi_typedarray_type type;
  void* planeData = nullptr;
  size_t planeLength = 0;
  napi_value planeBuffer;
  size_t planeOffset = 0;
  if (napi_get_typedarray_info(env, args[4], &type, &planeLength, &planeData, &planeBuffer,
                               &planeOffset) != napi_ok ||
      planeData == nullptr || planeLength < kFrustumFloats) {
    return njs::undefined(env);
  }

  void* vpData = nullptr;
  size_t vpLength = 0;
  napi_value vpBuffer;
  size_t vpOffset = 0;
  if (napi_get_typedarray_info(env, args[5], &type, &vpLength, &vpData, &vpBuffer, &vpOffset) !=
          napi_ok ||
      vpData == nullptr || type != napi_float64_array || vpLength < kMatrixElements) {
    return njs::undefined(env);
  }
  const auto* viewProjection = static_cast<const double*>(vpData);

  napi_valuetype tipoAlvo = napi_undefined;
  napi_typeof(env, args[6], &tipoAlvo);
  WGPUTexture alvo = (tipoAlvo == napi_null || tipoAlvo == napi_undefined)
                         ? nullptr
                         : static_cast<WGPUTexture>(njs::unwrapValue(env, args[6]));

  scene::ShadowGateFrame frame;
  double sceneNodes = -1.0;
  napi_get_value_double(env, args[7], &sceneNodes);
  frame.sceneNodeCount = static_cast<int32_t>(sceneNodes);
  bool vsm = false;
  napi_get_value_bool(env, args[8], &vsm);
  frame.vsmShadowMap = vsm;

  void* outData = nullptr;
  size_t outLength = 0;
  napi_value outBuffer;
  size_t outOffset = 0;
  if (napi_get_typedarray_info(env, args[9], &type, &outLength, &outData, &outBuffer,
                               &outOffset) != napi_ok ||
      outData == nullptr || outLength < kGateOutFloats) {
    return njs::undefined(env);
  }

  s.shadowCasters.enumerate(s.mirror, params, static_cast<const float*>(planeData));
  const scene::ShadowGateResult veredito = scene::evaluateShadowPassGate(
      s.mirror, s.shadowCasters.casters(), frame, geometriaRegistrada, nullptr);

  auto* out = static_cast<double*>(outData);
  for (int i = 0; i < scene::kShadowGateRefusalCount; i++) out[i] = veredito.counts[i];
  out[kGateOutRefusedCasters] = veredito.refusedCasters;
  out[kGateOutTotalCasters] = veredito.totalCasters;

  const bool pelaPorta = veredito.accepted;
  napi_value saida;
  if (!pelaPorta || alvo == nullptr) {
    // Sem alvo o passe não pode assumir, e recusar é o lado seguro: o JS
    // devolve o passe ao `three` e nada some da imagem.
    const int motivo = pelaPorta ? static_cast<int>(scene::ShadowGateRefusal::kGeometryMissing)
                                 : static_cast<int>(veredito.reason);
    napi_create_double(env, static_cast<double>(-motivo), &saida);
    return saida;
  }

  const std::vector<scene::NodeIndex>& casters = s.shadowCasters.casters();
  s.shadowItems.clear();
  s.shadowItems.reserve(casters.size());
  for (const scene::NodeIndex index : casters) {
    render::ShadowDrawItem item;
    const int32_t geometria = s.mirror.geometryId(index);
    if (geometria == scene::kNoGeometry) continue;
    item.geometryId = static_cast<uint32_t>(geometria);
    std::memcpy(item.model, s.mirror.worldMatrix(index), sizeof(item.model));
    // O lado da face é do MATERIAL e chega por frame; o sentido depende ainda
    // da matriz de mundo (escala espelhada inverte a face, como no `three`).
    item.cullMode =
        render::shadowCullMode(static_cast<uint8_t>(s.mirror.shadowSide(index)), item.model);
    s.shadowItems.push_back(item);
  }

  const uint32_t desenhados = render::drawShadowCasters(
      g_gpu, alvo, viewProjection, s.shadowItems.data(),
      static_cast<uint32_t>(s.shadowItems.size()));
  napi_create_double(env, static_cast<double>(desenhados), &saida);
  return saida;
}

}  // namespace

void registerSceneMirror(napi_env env, HostGpu* gpu) {
  g_gpu = gpu;
  napi_value global = nullptr;
  napi_get_global(env, &global);
  napi_value api = nullptr;
  napi_create_object(env, &api);
  njs::setMethod(env, api, "build", jsBuild);
  njs::setMethod(env, api, "worldMatrices", jsWorldMatrices);
  njs::setMethod(env, api, "syncBuffer", jsSyncBuffer);
  njs::setMethod(env, api, "update", jsUpdate);
  njs::setMethod(env, api, "appendNodes", jsAppendNodes);
  njs::setMethod(env, api, "removeNode", jsRemoveNode);
  njs::setMethod(env, api, "drawShadowPass", jsDrawShadowPass);
  napi_set_named_property(env, global, "__cortexSceneMirror", api);
}

}  // namespace shims
