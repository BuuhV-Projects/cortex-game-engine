// Ver raycast_shim.h (SPEC-0347).
//   addGeometry(pos: Float32Array, passo, deslocamento, vértices, índice|null) → token|null
//   addInstances(matrizes: Float32Array, quantas) → token|null
//   setInstances(token, matrizes: Float32Array, quantas) → bool
//   first(raio: Float64Array(8), n, slots: Int32Array(3n), matrizes: Float64Array[],
//         entradas: Float64Array, saída: Float64Array(8)) → candidata | -1 | -2
#include "raycast_shim.h"

#include <cstdint>
#include <memory>
#include <vector>

#include "../napi/napi_util.h"
#include "../physics/raycast/raycast_world.h"

namespace shims {
namespace {

constexpr size_t kArgsAddGeometry = 5;
constexpr size_t kArgsAddInstances = 2;
constexpr size_t kArgsSetInstances = 3;
constexpr size_t kArgsFirst = 6;
/** `raio`: origem (3), direção (3), near, far. */
constexpr size_t kRayDoubles = 8;
constexpr size_t kRayNear = 6;
constexpr size_t kRayFar = 7;
/** `slots` por candidata: geometria, lado, instâncias. */
constexpr size_t kSlotInts = 3;
/** `saída`: distância, ponto (3), normal (3), instância. */
constexpr size_t kOutDoubles = 8;
constexpr size_t kOutPoint = 1;
constexpr size_t kOutNormal = 4;
constexpr size_t kOutInstance = 7;
constexpr int kNoHit = -1;
constexpr int kBadArgs = -2;
constexpr int kMaxSide = static_cast<int>(raycast::Side::Double);

raycast::RaycastWorld& world() {
  static raycast::RaycastWorld instance;
  return instance;
}

/** Token guarda o id + 1 no ponteiro (0 = nulo). */
void* encodeId(int32_t id) { return reinterpret_cast<void*>(static_cast<intptr_t>(id) + 1); }
int32_t decodeId(void* data) { return static_cast<int32_t>(reinterpret_cast<intptr_t>(data) - 1); }

void finalizeGeometry(napi_env, void* data, void*) { world().removeGeometry(decodeId(data)); }
void finalizeInstances(napi_env, void* data, void*) { world().removeInstances(decodeId(data)); }

napi_value number(napi_env env, double v) {
  napi_value out;
  napi_create_double(env, v, &out);
  return out;
}

napi_value null(napi_env env) {
  napi_value out;
  napi_get_null(env, &out);
  return out;
}

struct Typed {
  void* data = nullptr;
  size_t length = 0;
  napi_typedarray_type type = napi_int8_array;
};

bool typed(napi_env env, napi_value v, Typed* out) {
  bool is = false;
  if (napi_is_typedarray(env, v, &is) != napi_ok || !is) return false;
  return napi_get_typedarray_info(env, v, &out->type, &out->length, &out->data, nullptr, nullptr) == napi_ok &&
         out->data != nullptr;
}

bool typedOf(napi_env env, napi_value v, napi_typedarray_type type, size_t minLength, Typed* out) {
  return typed(env, v, out) && out->type == type && out->length >= minLength;
}

size_t toSize(napi_env env, napi_value v) {
  double d = 0;
  napi_get_value_double(env, v, &d);
  return d > 0 ? static_cast<size_t>(d) : 0;
}

napi_value makeToken(napi_env env, int32_t id, napi_finalize finalizer) {
  napi_value token = njs::wrapHandle(env, encodeId(id), finalizer);
  napi_set_named_property(env, token, "id", number(env, id));
  return token;
}

/** Índice do token no padrão de `wrapHandle`, ou `kNone`. */
int32_t tokenId(napi_env env, napi_value token) {
  void* data = njs::unwrapValue(env, token);
  return data ? decodeId(data) : raycast::kNone;
}

napi_value jsAddGeometry(napi_env env, napi_callback_info info) {
  size_t argc = kArgsAddGeometry;
  napi_value args[kArgsAddGeometry] = {};
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  Typed pos;
  if (argc < kArgsAddGeometry || !typedOf(env, args[0], napi_float32_array, 1, &pos)) return null(env);
  raycast::PositionLayout layout{static_cast<const float*>(pos.data), toSize(env, args[1]), toSize(env, args[2]),
                                 toSize(env, args[3])};
  constexpr size_t kXyz = 3;
  if (layout.stride < kXyz || layout.vertexCount == 0 ||
      layout.offset + (layout.vertexCount - 1) * layout.stride + kXyz > pos.length) {
    return null(env);
  }
  std::vector<uint32_t> index;
  napi_valuetype indexType = napi_undefined;
  napi_typeof(env, args[4], &indexType);
  if (indexType != napi_null && indexType != napi_undefined) {
    Typed idx;
    if (!typed(env, args[4], &idx)) return null(env);
    if (idx.type == napi_uint16_array) {
      const auto* p = static_cast<const uint16_t*>(idx.data);
      index.assign(p, p + idx.length);
    } else if (idx.type == napi_uint32_array) {
      const auto* p = static_cast<const uint32_t*>(idx.data);
      index.assign(p, p + idx.length);
    } else {
      return null(env);
    }
  }
  const bool indexed = indexType != napi_null && indexType != napi_undefined;
  auto bvh = raycast::TriangleBvh::build(layout, indexed ? index.data() : nullptr, index.size());
  if (!bvh) return null(env);
  return makeToken(env, world().addGeometry(std::move(bvh)), finalizeGeometry);
}

bool fillInstances(napi_env env, int32_t id, napi_value matrices, napi_value count) {
  raycast::InstanceSet* set = world().instances(id);
  Typed m;
  const size_t n = toSize(env, count);
  if (set == nullptr || !typedOf(env, matrices, napi_float32_array, n * raycast::kMatrixElements, &m)) return false;
  set->set(static_cast<const float*>(m.data), n);
  return true;
}

napi_value jsAddInstances(napi_env env, napi_callback_info info) {
  size_t argc = kArgsAddInstances;
  napi_value args[kArgsAddInstances] = {};
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  if (argc < kArgsAddInstances) return null(env);
  const int32_t id = world().addInstances();
  if (!fillInstances(env, id, args[0], args[1])) {
    world().removeInstances(id);
    return null(env);
  }
  return makeToken(env, id, finalizeInstances);
}

napi_value jsSetInstances(napi_env env, napi_callback_info info) {
  size_t argc = kArgsSetInstances;
  napi_value args[kArgsSetInstances] = {};
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  napi_value out;
  napi_get_boolean(env, argc >= kArgsSetInstances && fillInstances(env, tokenId(env, args[0]), args[1], args[2]),
                   &out);
  return out;
}

/** Lê as candidatas da chamada em `out`; `false` = argumento inválido. */
bool readCandidates(napi_env env, size_t n, const Typed& slots, napi_value matrices, const Typed& entries,
                    std::vector<raycast::Candidate>* out) {
  out->resize(n);
  const auto* s = static_cast<const int32_t*>(slots.data);
  const auto* e = static_cast<const double*>(entries.data);
  for (size_t i = 0; i < n; i++) {
    napi_value mv;
    Typed m;
    if (napi_get_element(env, matrices, static_cast<uint32_t>(i), &mv) != napi_ok ||
        !typedOf(env, mv, napi_float64_array, raycast::kMatrixElements, &m)) {
      return false;
    }
    const int side = s[i * kSlotInts + 1];
    if (side < 0 || side > kMaxSide) return false;
    raycast::Candidate& c = (*out)[i];
    c.geometry = s[i * kSlotInts];
    c.side = static_cast<raycast::Side>(side);
    c.instances = s[i * kSlotInts + 2];
    c.matrix = static_cast<const double*>(m.data);
    c.entry = e[i];
  }
  return true;
}

napi_value jsFirst(napi_env env, napi_callback_info info) {
  size_t argc = kArgsFirst;
  napi_value args[kArgsFirst] = {};
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  if (argc < kArgsFirst) return number(env, kBadArgs);
  const size_t n = toSize(env, args[1]);
  Typed ray, slots, entries, outBuf;
  if (!typedOf(env, args[0], napi_float64_array, kRayDoubles, &ray) ||
      !typedOf(env, args[2], napi_int32_array, n * kSlotInts, &slots) ||
      !typedOf(env, args[4], napi_float64_array, n, &entries) ||
      !typedOf(env, args[5], napi_float64_array, kOutDoubles, &outBuf)) {
    return number(env, kBadArgs);
  }
  static std::vector<raycast::Candidate> candidates;  // reaproveitado entre chamadas (thread do JS)
  if (!readCandidates(env, n, slots, args[3], entries, &candidates)) return number(env, kBadArgs);
  const auto* r = static_cast<const double*>(ray.data);
  const raycast::WorldRay worldRay{{r[0], r[1], r[2]}, {r[3], r[4], r[5]}, r[kRayNear], r[kRayFar]};
  raycast::Hit hit;
  if (!world().firstHit(worldRay, candidates.data(), n, &hit)) return number(env, kNoHit);
  auto* o = static_cast<double*>(outBuf.data);
  o[0] = hit.distance;
  o[kOutPoint] = hit.point.x;
  o[kOutPoint + 1] = hit.point.y;
  o[kOutPoint + 2] = hit.point.z;
  o[kOutNormal] = hit.normal.x;
  o[kOutNormal + 1] = hit.normal.y;
  o[kOutNormal + 2] = hit.normal.z;
  o[kOutInstance] = hit.instance;
  return number(env, hit.candidate);
}

}  // namespace

void registerRaycast(napi_env env) {
  napi_value global = nullptr;
  napi_get_global(env, &global);
  napi_value api = njs::makeObject(env);
  njs::setMethod(env, api, "addGeometry", jsAddGeometry);
  njs::setMethod(env, api, "addInstances", jsAddInstances);
  njs::setMethod(env, api, "setInstances", jsSetInstances);
  njs::setMethod(env, api, "first", jsFirst);
  napi_set_named_property(env, global, "__cortexRaycast", api);
}

}  // namespace shims
