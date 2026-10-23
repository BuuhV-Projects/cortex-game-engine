// Matrizes de instância de um `InstancedMesh` pro raycast nativo (SPEC-0347),
// com as esferas das instâncias em mundo em cache — o mesmo descarte do
// `instancedRaycast` JS (SPEC-0305). Puro.
#pragma once

#include <cstddef>
#include <vector>

#include "triangle_bvh.h"

namespace raycast {

class InstanceSet {
 public:
  /** `instanceMatrix.array` (float, coluna-maior, 16 por instância). Invalida o cache. */
  void set(const float* matrices, size_t count);

  size_t count() const { return count_; }
  /** Matriz local da instância `i` (em double). */
  const double* local(size_t i) const { return &local_[i * kMatrixElements]; }

  /**
   * Esferas (x, y, z, raio) das instâncias em mundo pra `meshWorld` e a esfera da
   * geometria `geometryId`; refeitas só quando um dos dois (ou as instâncias) muda.
   */
  const std::vector<double>& worldSpheres(const double* meshWorld, int geometryId, const Sphere& base);

 private:
  std::vector<double> local_;
  size_t count_ = 0;
  std::vector<double> spheres_;
  double cachedWorld_[kMatrixElements] = {};
  int cachedGeometry_ = -1;
  bool cacheValid_ = false;
};

/** Floats por instância em {@link InstanceSet::worldSpheres}. */
constexpr size_t kSphereStride = 4;

}  // namespace raycast
