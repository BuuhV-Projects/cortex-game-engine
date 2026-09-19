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
// Veiculo raycast (SPEC-0209). O ponteiro do veiculo viaja como f64, igual ao
// do mundo.
struct RnVehicle;
RnVehicle* rn_vehicle_new(RnWorld* world, double chassis);
void rn_vehicle_free(RnVehicle* vehicle);
void rn_vehicle_set_up_axis(RnVehicle* vehicle, double axis);
void rn_vehicle_add_wheel(RnVehicle* vehicle, double px, double py, double pz,
                          double dx, double dy, double dz, double ax,
                          double ay, double az, double restLength,
                          double radius);
void rn_vehicle_set_wheel(RnVehicle* vehicle, double index, double param,
                          double value);
void rn_vehicle_update(RnVehicle* vehicle, RnWorld* world, double dt,
                       double groups);
void rn_vehicle_wheel_state(RnVehicle* vehicle, RnWorld* world, double index);
void rn_body_mass_props(RnWorld* world, double body, double mass, double cx,
                        double cy, double cz, double ix, double iy, double iz,
                        double wake);
double rn_body_collider(RnWorld* world, double body, double index);
double rn_collider_groups(RnWorld* world, double collider, double set,
                          double value);
// Raycast de mundo (SPEC-0216) — o `followGround` do carro depende dele.
double rn_world_cast_ray(RnWorld* world, double ox, double oy, double oz,
                         double dx, double dy, double dz, double maxToi,
                         double solid, double filterFlags, double excludeBody);
double rn_collider_get(RnWorld* world, double collider, double what);
void rn_body_remove(RnWorld* world, double body);
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

RnVehicle* vehicleFromArg(double value) {
  return reinterpret_cast<RnVehicle*>(static_cast<uintptr_t>(value));
}

napi_value jsBodyMassProps(napi_env env, napi_callback_info info) {
  readArgs(env, info, 10);
  rn_body_mass_props(worldFromArg(args[0]), args[1], args[2], args[3], args[4],
                     args[5], args[6], args[7], args[8], args[9]);
  return njs::undefined(env);
}

napi_value jsBodyCollider(napi_env env, napi_callback_info info) {
  readArgs(env, info, 3);
  return numberResult(env, rn_body_collider(worldFromArg(args[0]), args[1], args[2]));
}

napi_value jsColliderGroups(napi_env env, napi_callback_info info) {
  readArgs(env, info, 4);
  return numberResult(
      env, rn_collider_groups(worldFromArg(args[0]), args[1], args[2], args[3]));
}

// Raycast de mundo (SPEC-0216). Devolve 1/0; o resultado sai pelo scratch.
napi_value jsWorldCastRay(napi_env env, napi_callback_info info) {
  readArgs(env, info, 11);
  return numberResult(
      env, rn_world_cast_ray(worldFromArg(args[0]), args[1], args[2], args[3],
                             args[4], args[5], args[6], args[7], args[8],
                             args[9], args[10]));
}

napi_value jsBodyRemove(napi_env env, napi_callback_info info) {
  readArgs(env, info, 2);
  rn_body_remove(worldFromArg(args[0]), args[1]);
  return njs::undefined(env);
}

napi_value jsColliderGet(napi_env env, napi_callback_info info) {
  readArgs(env, info, 3);
  return numberResult(
      env, rn_collider_get(worldFromArg(args[0]), args[1], args[2]));
}

napi_value jsVehicleNew(napi_env env, napi_callback_info info) {
  readArgs(env, info, 2);
  RnVehicle* vehicle = rn_vehicle_new(worldFromArg(args[0]), args[1]);
  return numberResult(
      env, static_cast<double>(reinterpret_cast<uintptr_t>(vehicle)));
}

napi_value jsVehicleFree(napi_env env, napi_callback_info info) {
  readArgs(env, info, 1);
  rn_vehicle_free(vehicleFromArg(args[0]));
  return njs::undefined(env);
}

napi_value jsVehicleSetUpAxis(napi_env env, napi_callback_info info) {
  readArgs(env, info, 2);
  rn_vehicle_set_up_axis(vehicleFromArg(args[0]), args[1]);
  return njs::undefined(env);
}

napi_value jsVehicleAddWheel(napi_env env, napi_callback_info info) {
  readArgs(env, info, 12);
  rn_vehicle_add_wheel(vehicleFromArg(args[0]), args[1], args[2], args[3],
                       args[4], args[5], args[6], args[7], args[8], args[9],
                       args[10], args[11]);
  return njs::undefined(env);
}

napi_value jsVehicleSetWheel(napi_env env, napi_callback_info info) {
  readArgs(env, info, 4);
  rn_vehicle_set_wheel(vehicleFromArg(args[0]), args[1], args[2], args[3]);
  return njs::undefined(env);
}

napi_value jsVehicleUpdate(napi_env env, napi_callback_info info) {
  readArgs(env, info, 4);
  rn_vehicle_update(vehicleFromArg(args[0]), worldFromArg(args[1]), args[2],
                    args[3]);
  return njs::undefined(env);
}

napi_value jsVehicleWheelState(napi_env env, napi_callback_info info) {
  readArgs(env, info, 3);
  rn_vehicle_wheel_state(vehicleFromArg(args[0]), worldFromArg(args[1]),
                         args[2]);
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
  // Veiculo raycast (SPEC-0209) — o que faltava pra jogo de carro rodar no host.
  njs::setMethod(env, native, "bodyMassProps", jsBodyMassProps);
  njs::setMethod(env, native, "bodyCollider", jsBodyCollider);
  njs::setMethod(env, native, "colliderGroups", jsColliderGroups);
  // Raycast de mundo (SPEC-0216): sem ele o `followGround` do carro lançava
  // exceção todo frame e derrubava o tick inteiro do jogo.
  njs::setMethod(env, native, "worldCastRay", jsWorldCastRay);
  njs::setMethod(env, native, "colliderGet", jsColliderGet);
  njs::setMethod(env, native, "bodyRemove", jsBodyRemove);
  njs::setMethod(env, native, "vehicleNew", jsVehicleNew);
  njs::setMethod(env, native, "vehicleFree", jsVehicleFree);
  njs::setMethod(env, native, "vehicleSetUpAxis", jsVehicleSetUpAxis);
  njs::setMethod(env, native, "vehicleAddWheel", jsVehicleAddWheel);
  njs::setMethod(env, native, "vehicleSetWheel", jsVehicleSetWheel);
  njs::setMethod(env, native, "vehicleUpdate", jsVehicleUpdate);
  njs::setMethod(env, native, "vehicleWheelState", jsVehicleWheelState);
  napi_set_named_property(env, global, "__rapierNative", native);
}

}  // namespace shims
