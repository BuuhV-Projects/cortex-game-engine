#include "rapier.h"

#include <cstdint>
#include <vector>

#include "../napi/napi_util.h"

// C ABI do crate rapier-native (ver native/rapier-native/src/lib.rs).
extern "C" {
struct RnWorld;
RnWorld* rn_world_new(double gx, double gy, double gz);
void rn_world_free(RnWorld* world);
double* rn_world_scratch(RnWorld* world);
void rn_world_step(RnWorld* world);
double rn_body_create(RnWorld* world, double kind, double x, double y,
                      double z, double canSleep);
double rn_collider_shape(RnWorld* world, double body, double shapeKind,
                         double a, double b, double c, double friction,
                         double restitution, double sensor, double massMode,
                         double massValue, double ox, double oy, double oz);
double rn_collider_trimesh(RnWorld* world, double body, const float* verts,
                           size_t nverts, const uint32_t* indices,
                           size_t nidx);
void rn_body_get(RnWorld* world, double body, double what);
void rn_body_set(RnWorld* world, double body, double what, double x, double y,
                 double z, double qw, double wake);
}

namespace shims {
namespace {

// Ponteiro do mundo viaja como f64 (ponteiros user-space x64 cabem na
// mantissa de 52 bits sem perda).
RnWorld* worldFromArg(double value) {
  return reinterpret_cast<RnWorld*>(static_cast<uintptr_t>(value));
}

double args[16];
size_t readArgs(napi_env env, napi_callback_info info, size_t max) {
  size_t argc = max;
  napi_value values[16];
  napi_get_cb_info(env, info, &argc, values, nullptr, nullptr);
  for (size_t i = 0; i < argc && i < 16; ++i) {
    args[i] = 0;
    napi_get_value_double(env, values[i], &args[i]);
  }
  return argc;
}

napi_value numberResult(napi_env env, double value) {
  napi_value out = nullptr;
  napi_create_double(env, value, &out);
  return out;
}

napi_value jsWorldNew(napi_env env, napi_callback_info info) {
  readArgs(env, info, 3);
  RnWorld* world = rn_world_new(args[0], args[1], args[2]);
  return numberResult(
      env, static_cast<double>(reinterpret_cast<uintptr_t>(world)));
}

napi_value jsWorldFree(napi_env env, napi_callback_info info) {
  readArgs(env, info, 1);
  rn_world_free(worldFromArg(args[0]));
  return njs::undefined(env);
}

// ArrayBuffer externo sobre o scratch do mundo (16 f64) — o adapter JS cria
// um Float64Array sobre ele uma vez e lê resultados sem marshaling.
napi_value jsWorldScratch(napi_env env, napi_callback_info info) {
  readArgs(env, info, 1);
  double* scratch = rn_world_scratch(worldFromArg(args[0]));
  napi_value arrayBuffer = nullptr;
  napi_create_external_arraybuffer(env, scratch, 16 * sizeof(double), nullptr,
                                   nullptr, &arrayBuffer);
  return arrayBuffer;
}

napi_value jsWorldStep(napi_env env, napi_callback_info info) {
  readArgs(env, info, 1);
  rn_world_step(worldFromArg(args[0]));
  return njs::undefined(env);
}

napi_value jsBodyCreate(napi_env env, napi_callback_info info) {
  readArgs(env, info, 6);
  return numberResult(env, rn_body_create(worldFromArg(args[0]), args[1],
                                          args[2], args[3], args[4],
                                          args[5]));
}

napi_value jsColliderShape(napi_env env, napi_callback_info info) {
  readArgs(env, info, 14);
  return numberResult(
      env, rn_collider_shape(worldFromArg(args[0]), args[1], args[2], args[3],
                             args[4], args[5], args[6], args[7], args[8],
                             args[9], args[10], args[11], args[12],
                             args[13]));
}

// (world, body, Float32Array verts, Uint32Array indices)
napi_value jsColliderTrimesh(napi_env env, napi_callback_info info) {
  size_t argc = 4;
  napi_value values[4];
  napi_get_cb_info(env, info, &argc, values, nullptr, nullptr);
  if (argc < 4) return njs::undefined(env);
  double worldPtr = 0, body = 0;
  napi_get_value_double(env, values[0], &worldPtr);
  napi_get_value_double(env, values[1], &body);

  napi_typedarray_type type;
  size_t vertCount = 0, idxCount = 0;
  void* verts = nullptr;
  void* indices = nullptr;
  napi_value ab = nullptr;
  size_t offset = 0;
  napi_get_typedarray_info(env, values[2], &type, &vertCount, &verts, &ab,
                           &offset);
  if (type != napi_float32_array) return njs::undefined(env);
  napi_get_typedarray_info(env, values[3], &type, &idxCount, &indices, &ab,
                           &offset);
  if (type != napi_uint32_array) return njs::undefined(env);

  return numberResult(
      env, rn_collider_trimesh(worldFromArg(worldPtr), body,
                               static_cast<const float*>(verts),
                               vertCount / 3,
                               static_cast<const uint32_t*>(indices),
                               idxCount));
}

napi_value jsBodyGet(napi_env env, napi_callback_info info) {
  readArgs(env, info, 3);
  rn_body_get(worldFromArg(args[0]), args[1], args[2]);
  return njs::undefined(env);
}

napi_value jsBodySet(napi_env env, napi_callback_info info) {
  readArgs(env, info, 8);
  rn_body_set(worldFromArg(args[0]), args[1], args[2], args[3], args[4],
              args[5], args[6], args[7]);
  return njs::undefined(env);
}

}  // namespace

void registerRapier(napi_env env) {
  napi_value global = nullptr;
  napi_get_global(env, &global);
  napi_value native = njs::makeObject(env);
  njs::setMethod(env, native, "worldNew", jsWorldNew);
  njs::setMethod(env, native, "worldFree", jsWorldFree);
  njs::setMethod(env, native, "worldScratch", jsWorldScratch);
  njs::setMethod(env, native, "worldStep", jsWorldStep);
  njs::setMethod(env, native, "bodyCreate", jsBodyCreate);
  njs::setMethod(env, native, "colliderShape", jsColliderShape);
  njs::setMethod(env, native, "colliderTrimesh", jsColliderTrimesh);
  njs::setMethod(env, native, "bodyGet", jsBodyGet);
  njs::setMethod(env, native, "bodySet", jsBodySet);
  napi_set_named_property(env, global, "__rapierNative", native);
}

}  // namespace shims
