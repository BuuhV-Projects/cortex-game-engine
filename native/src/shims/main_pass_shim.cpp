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
/** Argumentos de `project`: planos, viewProj, índices de saída, `z` de saída. */
constexpr size_t kArgsProject = 4;
/** Argumentos de `setBounds`: índice, cx, cy, cz, raio. */
constexpr size_t kArgsSetBounds = 5;
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
 * `project(planos: Float64Array(24), viewProj: Float64Array(16),
 *          indices: Int32Array, z: Float64Array): number`
 *
 * Devolve quantos candidatos foram escritos, ou um código negativo. Na recusa
 * ({@link kProjectRefused}) o índice do nó que recusou vai em `indices[0]`.
 */
napi_value jsProject(napi_env env, napi_callback_info info) {
  size_t argc = kArgsProject;
  napi_value args[kArgsProject];
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

  scene::MainPassCuller& c = culler();
  const int count = c.cull(*mirror, planes, viewProj);
  if (count == scene::kMainCullRefused) {
    indices[0] = c.refusedAt();
    return number(env, kProjectRefused);
  }
  const auto n = static_cast<size_t>(count);
  if (n > indexLength || n > depthLength) return number(env, kProjectOutTooSmall);
  const auto& candidates = c.candidates();
  for (size_t i = 0; i < n; i++) {
    indices[i] = candidates[i].index;
    depths[i] = candidates[i].z;
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

}  // namespace

void registerMainPass(napi_env env) {
  napi_value global = nullptr;
  napi_get_global(env, &global);
  napi_value api = njs::makeObject(env);
  njs::setMethod(env, api, "project", jsProject);
  njs::setMethod(env, api, "setBounds", jsSetBounds);
  napi_set_named_property(env, global, "__cortexMainPass", api);
}

}  // namespace shims
