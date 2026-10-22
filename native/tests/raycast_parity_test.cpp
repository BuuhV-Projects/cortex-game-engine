// Paridade do raycast nativo com o caminho JS (SPEC-0347): a cena e os 1ºs
// acertos de raycast_golden.h vêm do `firstHitAmong` JS
// (tests/physics/nativeRaycastGolden.test.ts); o C++ tem de achar o mesmo
// objeto, a mesma instância e a mesma distância/ponto.
#include <cmath>
#include <cstdio>
#include <vector>

#include "../src/physics/raycast/raycast_world.h"
#include "harness.h"
#include "raycast_golden.h"

namespace tests {

void testRaycastBateComOGoldenDoJs() {
  using namespace raycast_golden;
  constexpr double kTolerance = 1e-5;  // m
  raycast::RaycastWorld w;
  std::vector<int32_t> ids;
  for (const Geometry& g : kGeometries) {
    const raycast::PositionLayout layout{g.pos, g.stride, g.offset, g.vertices};
    ids.push_back(w.addGeometry(raycast::TriangleBvh::build(layout, g.index, g.indexCount)));
    CHECK(ids.back() != raycast::kNone);
  }
  const int32_t set = w.addInstances();
  w.instances(set)->set(kInstances, kInstanceCount);
  std::vector<raycast::Candidate> cand;
  for (const MeshDef& m : kMeshes) {
    cand.push_back({ids[static_cast<size_t>(m.geometry)], static_cast<raycast::Side>(m.side),
                    m.instanced ? set : raycast::kNone, m.matrix, 0});
  }
  int mismatches = 0;
  int index = 0;
  for (const Ray& r : kRays) {
    const raycast::WorldRay ray{{r.v[0], r.v[1], r.v[2]}, {r.v[3], r.v[4], r.v[5]}, r.v[6], r.v[7]};
    raycast::Hit h;
    const bool got = w.firstHit(ray, cand.data(), cand.size(), &h);
    bool ok = got == (r.mesh >= 0);
    if (ok && got) {
      ok = h.candidate == r.mesh && h.instance == r.instance && std::fabs(h.distance - r.distance) < kTolerance &&
           std::fabs(h.point.x - r.point[0]) < kTolerance && std::fabs(h.point.y - r.point[1]) < kTolerance &&
           std::fabs(h.point.z - r.point[2]) < kTolerance;
    }
    if (!ok) {
      if (mismatches < 5) {
        std::printf("  raio %d: C++ %s malha %d inst %d d=%.9f | JS malha %d inst %d d=%.9f\n", index,
                    got ? "acertou" : "errou", got ? h.candidate : -1, got ? h.instance : -1, got ? h.distance : 0.0,
                    r.mesh, r.instance, r.distance);
      }
      mismatches++;
    }
    index++;
  }
  CHECK(mismatches == 0);
}

}  // namespace tests
