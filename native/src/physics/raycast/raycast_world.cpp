// Ver raycast_world.h (SPEC-0347).
#include "raycast_world.h"

#include <cmath>

namespace raycast {
namespace {

/** Folga relativa da esfera da instância (a mesma do `instancedRaycast` JS). */
constexpr double kSphereSlack = 1e-6;

/** `rayMayHitSphere` do JS: `false` só quando é certeza que o raio não toca a esfera. */
bool rayMayHitSphere(const WorldRay& ray, const double* s) {
  const double rr = s[3] * (1 + kSphereSlack) + kSphereSlack;
  const Vec3 d = sub({s[0], s[1], s[2]}, ray.origin);
  const double t = dot(d, ray.dir);
  if (t < -rr || t - rr > ray.far) return false;
  return dot(d, d) - t * t <= rr * rr;
}

template <typename T>
int32_t acquireSlot(std::vector<std::unique_ptr<T>>& slots, std::vector<int32_t>& freeList, std::unique_ptr<T> v) {
  if (!freeList.empty()) {
    const int32_t id = freeList.back();
    freeList.pop_back();
    slots[static_cast<size_t>(id)] = std::move(v);
    return id;
  }
  slots.push_back(std::move(v));
  return static_cast<int32_t>(slots.size() - 1);
}

template <typename T>
bool releaseSlot(std::vector<std::unique_ptr<T>>& slots, std::vector<int32_t>& freeList, int32_t id) {
  if (id < 0 || static_cast<size_t>(id) >= slots.size() || !slots[static_cast<size_t>(id)]) return false;
  slots[static_cast<size_t>(id)].reset();
  freeList.push_back(id);
  return true;
}

}  // namespace

int32_t RaycastWorld::addGeometry(std::unique_ptr<TriangleBvh> bvh) {
  if (!bvh) return kNone;
  liveGeometries_++;
  return acquireSlot(geometries_, freeGeometries_, std::move(bvh));
}

void RaycastWorld::removeGeometry(int32_t id) {
  if (releaseSlot(geometries_, freeGeometries_, id)) liveGeometries_--;
}

int32_t RaycastWorld::addInstances() {
  return acquireSlot(instanceSets_, freeInstanceSets_, std::make_unique<InstanceSet>());
}

InstanceSet* RaycastWorld::instances(int32_t id) {
  if (id < 0 || static_cast<size_t>(id) >= instanceSets_.size()) return nullptr;
  return instanceSets_[static_cast<size_t>(id)].get();
}

void RaycastWorld::removeInstances(int32_t id) { releaseSlot(instanceSets_, freeInstanceSets_, id); }

const TriangleBvh* RaycastWorld::geometry(int32_t id) const {
  if (id < 0 || static_cast<size_t>(id) >= geometries_.size()) return nullptr;
  return geometries_[static_cast<size_t>(id)].get();
}

bool RaycastWorld::testMesh(const TriangleBvh& bvh, Side side, const double* world, const WorldRay& ray, Hit* best,
                            bool haveBest) {
  double inv[kMatrixElements];
  if (!invertAffine(world, inv)) return false;
  const LocalRay local{transformPoint(inv, ray.origin), transformDirection(inv, ray.dir)};
  // o parâmetro local É a distância em mundo (direção local sem normalizar)
  const double far = haveBest ? std::fmin(ray.far, best->distance) : ray.far;
  LocalHit h;
  if (!bvh.raycastFirst(local, side, ray.near, far, &h)) return false;
  const Vec3 pl{local.origin.x + local.dir.x * h.t, local.origin.y + local.dir.y * h.t,
                local.origin.z + local.dir.z * h.t};
  const Vec3 pw = transformPoint(world, pl);
  const Vec3 d = sub(pw, ray.origin);
  const double distance = std::sqrt(dot(d, d));
  if (distance < ray.near || distance > ray.far) return false;  // como o `three`: distância em mundo
  if (haveBest && !(distance < best->distance)) return false;
  best->distance = distance;
  best->point = pw;
  best->normal = h.normal;
  return true;
}

bool RaycastWorld::firstHit(const WorldRay& ray, const Candidate* candidates, size_t count, Hit* out) {
  bool have = false;
  for (size_t i = 0; i < count; i++) {
    const Candidate& c = candidates[i];
    if (have && c.entry > out->distance) break;  // nada daqui pra frente acerta antes
    const TriangleBvh* bvh = geometry(c.geometry);
    if (bvh == nullptr || c.matrix == nullptr) continue;
    if (c.instances == kNone) {
      if (testMesh(*bvh, c.side, c.matrix, ray, out, have)) {
        have = true;
        out->candidate = static_cast<int32_t>(i);
        out->instance = kNone;
      }
      continue;
    }
    InstanceSet* set = instances(c.instances);
    if (set == nullptr) continue;
    const std::vector<double>& spheres = set->worldSpheres(c.matrix, c.geometry, bvh->sphere());
    double world[kMatrixElements];
    for (size_t k = 0; k < set->count(); k++) {
      if (!rayMayHitSphere(ray, &spheres[k * kSphereStride])) continue;
      multiplyMatrices(c.matrix, set->local(k), world);
      if (testMesh(*bvh, c.side, world, ray, out, have)) {
        have = true;
        out->candidate = static_cast<int32_t>(i);
        out->instance = static_cast<int32_t>(k);
      }
    }
  }
  return have;
}

}  // namespace raycast
