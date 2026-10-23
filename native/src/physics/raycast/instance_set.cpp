// Ver instance_set.h (SPEC-0347).
#include "instance_set.h"

#include <algorithm>

namespace raycast {

void InstanceSet::set(const float* matrices, size_t count) {
  local_.assign(matrices, matrices + count * kMatrixElements);
  count_ = count;
  cacheValid_ = false;
}

const std::vector<double>& InstanceSet::worldSpheres(const double* meshWorld, int geometryId, const Sphere& base) {
  const bool same = cacheValid_ && cachedGeometry_ == geometryId &&
                    std::equal(meshWorld, meshWorld + kMatrixElements, cachedWorld_);
  if (same) return spheres_;
  spheres_.resize(count_ * kSphereStride);
  double world[kMatrixElements];
  for (size_t i = 0; i < count_; i++) {
    multiplyMatrices(meshWorld, local(i), world);
    const Vec3 c = transformPoint(world, base.center);
    double* s = &spheres_[i * kSphereStride];
    s[0] = c.x;
    s[1] = c.y;
    s[2] = c.z;
    s[3] = base.radius * maxScaleOnAxis(world);
  }
  std::copy(meshWorld, meshWorld + kMatrixElements, cachedWorld_);
  cachedGeometry_ = geometryId;
  cacheValid_ = true;
  return spheres_;
}

}  // namespace raycast
