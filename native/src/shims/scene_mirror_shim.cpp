// Ver scene_mirror_shim.h (SPEC-0234).
#include "scene_mirror_shim.h"

#include <cstdint>
#include <vector>

#include "../napi/napi_util.h"
#include "../scene/scene_mirror.h"

namespace shims {
namespace {

/** Floats que descrevem um nó no buffer de construção: pai + transform + raio + visível. */
constexpr int kBuildFloatsPerNode = 14;
/** Floats do frustum: 6 planos de 4. */
constexpr int kFrustumFloats = scene::kFrustumPlanes * 4;

/**
 * Estado do espelho, um por processo.
 *
 * Vive em `static` e não em `napi_env` porque o host tem um runtime só e a cena
 * é única — e porque o `ArrayBuffer` externo que o JS segura aponta para a
 * memória daqui: ela precisa durar mais que qualquer escopo de callback.
 */
struct MirrorState {
  scene::SceneMirror mirror;
  /** Transforms que o JS escreve por frame (só os nós dinâmicos). */
  std::vector<float> syncBuffer;
  bool built = false;
};

MirrorState& state() {
  static MirrorState instance;
  return instance;
}

/**
 * `build(descricao: Float32Array)` — recebe a cena inteira uma vez.
 *
 * Layout por nó (14 floats): pai, px, py, pz, qx, qy, qz, qw, sx, sy, sz,
 * raio, visível, reservado. O reservado existe para o layout ficar par e não
 * precisar de renumeração quando entrar mais um campo.
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
  for (size_t i = 0; i < nodeCount; i++) {
    const float* row = floats + i * kBuildFloatsPerNode;
    scene::NodeDesc& node = nodes[i];
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
  }

  MirrorState& s = state();
  s.built = s.mirror.build(nodes);
  // Espaço para o pior caso: todos os nós mudando num frame.
  s.syncBuffer.assign(nodeCount * scene::kSyncFloatsPerNode, 0.0f);
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
  const size_t floatCount = s.mirror.worldFloatCount();
  napi_value buffer;
  // Sem finalizer: a memória é do `SceneMirror`, que vive enquanto o processo
  // viver. Liberar aqui soltaria memória que o C++ ainda usa.
  if (napi_create_external_arraybuffer(env, s.mirror.worldData(), floatCount * sizeof(float), nullptr,
                                       nullptr, &buffer) != napi_ok) {
    return njs::undefined(env);
  }
  napi_value typed;
  if (napi_create_typedarray(env, napi_float32_array, floatCount, buffer, 0, &typed) != napi_ok) {
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
  if (napi_create_external_arraybuffer(env, s.syncBuffer.data(), s.syncBuffer.size() * sizeof(float),
                                       nullptr, nullptr, &buffer) != napi_ok) {
    return njs::undefined(env);
  }
  napi_value typed;
  if (napi_create_typedarray(env, napi_float32_array, s.syncBuffer.size(), buffer, 0, &typed) != napi_ok) {
    return njs::undefined(env);
  }
  return typed;
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

}  // namespace

void registerSceneMirror(napi_env env) {
  napi_value global = nullptr;
  napi_get_global(env, &global);
  napi_value api = nullptr;
  napi_create_object(env, &api);
  njs::setMethod(env, api, "build", jsBuild);
  njs::setMethod(env, api, "worldMatrices", jsWorldMatrices);
  njs::setMethod(env, api, "syncBuffer", jsSyncBuffer);
  njs::setMethod(env, api, "update", jsUpdate);
  napi_set_named_property(env, global, "__cortexSceneMirror", api);
}

}  // namespace shims
