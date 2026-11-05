// Ver scene_mirror_shim.h (SPEC-0234).
#include "scene_mirror_shim.h"

#include <cstdint>
#include <vector>

#include "../napi/napi_util.h"
#include "../render/alpha_clip_store.h"
#include "scene_mirror_state.h"

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
/** Argumentos de `setInstances`: índice, matrizes e quantas (SPEC-0289). */
constexpr size_t kArgsSetInstances = 3;

/** O estado do processo (ver scene_mirror_state.h). */
MirrorState& state() { return mirrorState(); }

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
  // Espelho novo = índices novos: instâncias do anterior não descrevem ninguém.
  s.instances.clear();
  render::alphaClipStore().clear();  // idem para o recorte alfa (SPEC-0642)
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
  // O slot vira lápide e pode ser reaproveitado: o próximo dono não herda as
  // matrizes de instância de quem saiu (SPEC-0289).
  if (saiu > 0) {
    const auto saiuDoEspelho = [&s](int32_t node) {
      return node >= 0 && static_cast<size_t>(node) < s.mirror.size() &&
             s.mirror.removed(static_cast<scene::NodeIndex>(node));
    };
    s.instances.eraseIf(saiuDoEspelho);
    render::alphaClipStore().eraseIf(saiuDoEspelho);
  }
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
 * `setInstances(indice, matrizes, quantas)` — as matrizes de instância de um
 * `InstancedMesh` espelhado (SPEC-0289).
 *
 * O JS chama só quando `instanceMatrix.version` ou `count` mudam; `matrizes` é
 * um `Float32Array` com pelo menos `quantas × 16` floats. Devolve `true` quando
 * o host guardou — `false` deixa o nó sem instâncias, e o gate recusa.
 */
napi_value jsSetInstances(napi_env env, napi_callback_info info) {
  size_t argc = kArgsSetInstances;
  napi_value args[kArgsSetInstances];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  MirrorState& s = state();
  bool ok = false;
  int32_t index = -1;
  uint32_t count = 0;
  napi_typedarray_type type;
  void* data = nullptr;
  size_t length = 0;
  napi_value buffer;
  size_t offset = 0;
  if (s.built && argc >= kArgsSetInstances && napi_get_value_int32(env, args[0], &index) == napi_ok &&
      napi_get_value_uint32(env, args[2], &count) == napi_ok &&
      napi_get_typedarray_info(env, args[1], &type, &length, &data, &buffer, &offset) == napi_ok &&
      type == napi_float32_array && index >= 0 &&
      static_cast<size_t>(index) < s.mirror.size() &&
      !s.mirror.removed(static_cast<scene::NodeIndex>(index)) &&
      length >= static_cast<size_t>(count) * render::kInstanceMatrixFloats) {
    ok = s.instances.upload(g_gpu, index, static_cast<const float*>(data), count);
  }
  napi_value out;
  napi_get_boolean(env, ok, &out);
  return out;
}

}  // namespace

MirrorState& mirrorState() {
  static MirrorState instance;
  return instance;
}

HostGpu* mirrorGpu() { return g_gpu; }

scene::SceneMirror* builtSceneMirror() {
  MirrorState& s = state();
  return s.built ? &s.mirror : nullptr;
}

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
  njs::setMethod(env, api, "setInstances", jsSetInstances);
  napi_set_named_property(env, global, "__cortexSceneMirror", api);
}

}  // namespace shims
