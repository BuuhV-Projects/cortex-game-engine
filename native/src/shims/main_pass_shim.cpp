// Ver main_pass_shim.h (SPEC-0332).
#include "main_pass_shim.h"

#include <cstdint>

#include "../napi/napi_util.h"
#include "../scene/main_pass_culler.h"
#include "../scene/scene_mirror.h"
#include "scene_mirror_shim.h"

namespace shims {
namespace {

/** Códigos negativos de `project` (o caso bom devolve quantos candidatos). */
constexpr int kProjectRefused = scene::kMainCullRefused;
constexpr int kProjectBadArgs = -2;
constexpr int kProjectOutTooSmall = -3;
/** Argumentos obrigatórios de `project`: planos, viewProj, índices de saída, `z` de saída. */
constexpr size_t kArgsProject = 4;
/** Com o 5º, opcional: versões do mundo de saída (SPEC-0682). */
constexpr size_t kArgsProjectVersions = 5;
/** Com o 6º, opcional: a máscara de camadas da câmera (SPEC-0686). */
constexpr size_t kArgsProjectLayers = 6;
/** Argumentos de `setBounds`: índice, cx, cy, cz, raio. */
constexpr size_t kArgsSetBounds = 5;
/** Argumentos de `setLayers`: índice, máscara. */
constexpr size_t kArgsSetLayers = 2;
/** Argumentos de `setObjectSphere`: índice, centro e raio do objeto, centro da geometria. */
constexpr size_t kArgsSetObjectSphere = 8;
/** Doubles dos 6 planos do frustum. */
constexpr size_t kPlaneDoubles = scene::kFrustumPlanes * 4;

/** O culler guarda os vetores de trabalho entre frames (sem malloc por frame). */
scene::MainPassCuller& culler() {
  static scene::MainPassCuller instance;
  return instance;
}

/** Lê um `TypedArray` do tipo pedido com pelo menos `minLength` elementos. */
template <typename T>
T* typedArray(napi_env env, napi_value value, napi_typedarray_type expected, size_t minLength,
              size_t* length) {
  napi_typedarray_type type;
  void* data = nullptr;
  napi_value buffer;
  size_t offset = 0;
  if (napi_get_typedarray_info(env, value, &type, length, &data, &buffer, &offset) != napi_ok) return nullptr;
  if (type != expected || data == nullptr || *length < minLength) return nullptr;
  return static_cast<T*>(data);
}

napi_value number(napi_env env, double value) {
  napi_value out;
  napi_create_double(env, value, &out);
  return out;
}

/**
 * Máscara de camadas do JS em 32 bits: o `three` guarda `-1` (`enableAll`) e
 * `2^31` (`set(31)`, com `>>> 0`), e o `&` dele olha os 32 bits de baixo.
 */
uint32_t layerMask(napi_env env, napi_value value) {
  int64_t raw = 0;
  napi_get_value_int64(env, value, &raw);
  return static_cast<uint32_t>(static_cast<uint64_t>(raw));
}

/**
 * `project(planos: Float64Array(24), viewProj: Float64Array(16),
 *          indices: Int32Array, z: Float64Array, versions?: Float64Array): number`
 *
 * Devolve quantos candidatos foram escritos, ou um código negativo. Na recusa
 * ({@link kProjectRefused}) o índice do nó que recusou vai em `indices[0]`.
 * Com `versions`, escreve a versão da matriz de mundo de cada candidato
 * (SPEC-0682; double: 2^53 versões não acabam).
 */
napi_value jsProject(napi_env env, napi_callback_info info) {
  size_t argc = kArgsProjectLayers;
  napi_value args[kArgsProjectLayers];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  scene::SceneMirror* mirror = builtSceneMirror();
  if (mirror == nullptr || argc < kArgsProject) return number(env, kProjectBadArgs);

  size_t planeLength = 0, vpLength = 0, indexLength = 0, depthLength = 0;
  const auto* planes = typedArray<const double>(env, args[0], napi_float64_array, kPlaneDoubles, &planeLength);
  const auto* viewProj =
      typedArray<const double>(env, args[1], napi_float64_array, scene::kViewProjFloats, &vpLength);
  auto* indices = typedArray<int32_t>(env, args[2], napi_int32_array, 1, &indexLength);
  auto* depths = typedArray<double>(env, args[3], napi_float64_array, 1, &depthLength);
  if (planes == nullptr || viewProj == nullptr || indices == nullptr || depths == nullptr) {
    return number(env, kProjectBadArgs);
  }
  size_t versionLength = 0;
  double* versions = nullptr;
  if (argc >= kArgsProjectVersions) {
    versions = typedArray<double>(env, args[kArgsProject], napi_float64_array, 1, &versionLength);
    if (versions == nullptr) return number(env, kProjectBadArgs);
  }

  const uint32_t cameraLayers = argc >= kArgsProjectLayers ? layerMask(env, args[kArgsProjectVersions]) : scene::kAllLayers;

  scene::MainPassCuller& c = culler();
  const int count = c.cull(*mirror, planes, viewProj, cameraLayers);
  if (count == scene::kMainCullRefused) {
    indices[0] = c.refusedAt();
    return number(env, kProjectRefused);
  }
  const auto n = static_cast<size_t>(count);
  if (n > indexLength || n > depthLength || (versions != nullptr && n > versionLength)) {
    return number(env, kProjectOutTooSmall);
  }
  const auto& candidates = c.candidates();
  for (size_t i = 0; i < n; i++) {
    indices[i] = candidates[i].index;
    depths[i] = candidates[i].z;
  }
  if (versions != nullptr) {
    for (size_t i = 0; i < n; i++) versions[i] = static_cast<double>(candidates[i].worldVersion);
  }
  return number(env, count);
}

/** `setBounds(indice, cx, cy, cz, raio)` — a esfera local do nó mudou. */
napi_value jsSetBounds(napi_env env, napi_callback_info info) {
  size_t argc = kArgsSetBounds;
  napi_value args[kArgsSetBounds];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  scene::SceneMirror* mirror = builtSceneMirror();
  if (mirror == nullptr || argc < kArgsSetBounds) return njs::undefined(env);
  int32_t index = -1;
  scene::Bounds bounds;
  napi_get_value_int32(env, args[0], &index);
  napi_get_value_double(env, args[1], &bounds.cx);
  napi_get_value_double(env, args[2], &bounds.cy);
  napi_get_value_double(env, args[3], &bounds.cz);
  napi_get_value_double(env, args[4], &bounds.radius);
  mirror->setBounds(index, bounds);
  return njs::undefined(env);
}

/** `setLayers(indice, mascara)` — a `layers.mask` do nó mudou (SPEC-0686). */
napi_value jsSetLayers(napi_env env, napi_callback_info info) {
  size_t argc = kArgsSetLayers;
  napi_value args[kArgsSetLayers];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  if (argc < kArgsSetLayers) return njs::undefined(env);
  int32_t index = -1;
  napi_get_value_int32(env, args[0], &index);
  culler().slots().setLayers(index, layerMask(env, args[1]));
  return njs::undefined(env);
}

/**
 * `setObjectSphere(indice, ocx, ocy, ocz, oraio, gcx, gcy, gcz)` — a esfera do
 * OBJETO (corte) e o centro da esfera da geometria (`z`), locais (SPEC-0686).
 */
napi_value jsSetObjectSphere(napi_env env, napi_callback_info info) {
  size_t argc = kArgsSetObjectSphere;
  napi_value args[kArgsSetObjectSphere];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  if (argc < kArgsSetObjectSphere) return njs::undefined(env);
  int32_t index = -1;
  scene::ObjectSphere sphere;
  napi_get_value_int32(env, args[0], &index);
  napi_get_value_double(env, args[1], &sphere.cull.cx);
  napi_get_value_double(env, args[2], &sphere.cull.cy);
  napi_get_value_double(env, args[3], &sphere.cull.cz);
  napi_get_value_double(env, args[4], &sphere.cull.radius);
  napi_get_value_double(env, args[5], &sphere.depthX);
  napi_get_value_double(env, args[6], &sphere.depthY);
  napi_get_value_double(env, args[7], &sphere.depthZ);
  culler().slots().setObjectSphere(index, sphere);
  return njs::undefined(env);
}

/** `clearObjectSphere(indice)` — o JS volta a cortar o nó. */
napi_value jsClearObjectSphere(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value arg;
  napi_get_cb_info(env, info, &argc, &arg, nullptr, nullptr);
  if (argc < 1) return njs::undefined(env);
  int32_t index = -1;
  napi_get_value_int32(env, arg, &index);
  culler().slots().clearObjectSphere(index);
  return njs::undefined(env);
}

/** `resetSlots()` — o espelho foi reconstruído: camadas e esferas voltam ao padrão. */
napi_value jsResetSlots(napi_env env, napi_callback_info /*info*/) {
  culler().slots().reset();
  return njs::undefined(env);
}

void setCapability(napi_env env, napi_value api, const char* name) {
  napi_value capability = nullptr;
  napi_get_boolean(env, true, &capability);
  napi_set_named_property(env, api, name, capability);
}

}  // namespace

void registerMainPass(napi_env env) {
  napi_value global = nullptr;
  napi_get_global(env, &global);
  napi_value api = njs::makeObject(env);
  njs::setMethod(env, api, "project", jsProject);
  njs::setMethod(env, api, "setBounds", jsSetBounds);
  njs::setMethod(env, api, "setLayers", jsSetLayers);
  njs::setMethod(env, api, "setObjectSphere", jsSetObjectSphere);
  njs::setMethod(env, api, "clearObjectSphere", jsClearObjectSphere);
  njs::setMethod(env, api, "resetSlots", jsResetSlots);
  // O JS só passa o 5º argumento de `project` quando vê isto (SPEC-0682).
  setCapability(env, api, "worldVersions");
  // E o 6º, mais `setLayers`/`resetSlots`, com este (SPEC-0686).
  setCapability(env, api, "layerMask");
  setCapability(env, api, "objectSpheres");
  napi_set_named_property(env, global, "__cortexMainPass", api);
}

}  // namespace shims
