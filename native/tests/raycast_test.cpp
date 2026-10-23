// Unidades do raycast nativo (SPEC-0347): triângulo com lado da face, BVH
// contra força bruta, instâncias e a poda por entrada.
#include <cmath>
#include <cstdint>
#include <random>
#include <vector>

#include "../src/physics/raycast/raycast_world.h"
#include "harness.h"

namespace tests {
namespace {

using raycast::Side;
using raycast::Vec3;

constexpr double kEps = 1e-9;
const double kIdentity[raycast::kMatrixElements] = {1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1};

/** Quadrado no plano z = 0 de (-1,-1) a (1,1), frente pra +z (sentido anti-horário). */
const float kQuad[] = {-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0};
const uint32_t kQuadIndex[] = {0, 1, 2, 0, 2, 3};

std::unique_ptr<raycast::TriangleBvh> quad() {
  return raycast::TriangleBvh::build({kQuad, 3, 0, 4}, kQuadIndex, 6);
}

raycast::WorldRay ray(Vec3 o, Vec3 d, double far = INFINITY) { return {o, d, 0, far}; }

}  // namespace

void testRaycastLadoDaFace() {
  raycast::RaycastWorld w;
  const int32_t g = w.addGeometry(quad());
  raycast::Candidate c{g, Side::Front, raycast::kNone, kIdentity, 0};
  raycast::Hit h;
  CHECK(w.firstHit(ray({0, 0, 5}, {0, 0, -1}), &c, 1, &h));  // de frente
  CHECK(std::fabs(h.distance - 5) < kEps);
  CHECK(std::fabs(h.normal.z - 1) < kEps);
  CHECK(!w.firstHit(ray({0, 0, -5}, {0, 0, 1}), &c, 1, &h));  // por trás: FrontSide descarta
  c.side = Side::Back;
  CHECK(w.firstHit(ray({0, 0, -5}, {0, 0, 1}), &c, 1, &h));
  CHECK(!w.firstHit(ray({0, 0, 5}, {0, 0, -1}), &c, 1, &h));
  c.side = Side::Double;
  CHECK(w.firstHit(ray({0, 0, -5}, {0, 0, 1}), &c, 1, &h));
  CHECK(w.firstHit(ray({0, 0, 5}, {0, 0, -1}), &c, 1, &h));
  CHECK(!w.firstHit(ray({0, 0, 5}, {0, 0, -1}, 4), &c, 1, &h));  // além do far
}

void testRaycastMatrizComEscalaNaoUniforme() {
  raycast::RaycastWorld w;
  const int32_t g = w.addGeometry(quad());
  // escala (3, 1, 2) e translação (10, 0, -4): o quadrado vai de x 7..13 em z = -4
  const double m[raycast::kMatrixElements] = {3, 0, 0, 0, 0, 1, 0, 0, 0, 0, 2, 0, 10, 0, -4, 1};
  raycast::Candidate c{g, Side::Front, raycast::kNone, m, 0};
  raycast::Hit h;
  CHECK(w.firstHit(ray({12.5, 0.5, 0}, {0, 0, -1}), &c, 1, &h));
  CHECK(std::fabs(h.distance - 4) < kEps);
  CHECK(std::fabs(h.point.x - 12.5) < kEps && std::fabs(h.point.z + 4) < kEps);
  CHECK(!w.firstHit(ray({13.5, 0.5, 0}, {0, 0, -1}), &c, 1, &h));
}

void testRaycastBvhIgualForcaBruta() {
  std::mt19937 gen(347);
  std::uniform_real_distribution<float> u(-10, 10);
  constexpr int kTris = 500;
  constexpr int kRays = 400;
  std::vector<float> pos(kTris * 9);
  for (float& v : pos) v = u(gen);
  auto bvh = raycast::TriangleBvh::build({pos.data(), 3, 0, kTris * 3}, nullptr, 0);
  CHECK(bvh != nullptr && bvh->triangleCount() == kTris);
  int hits = 0, agree = 0;
  std::uniform_int_distribution<int> pick(0, kTris - 1);
  for (int r = 0; r < kRays; r++) {
    raycast::LocalRay lr{{u(gen) * 2, u(gen) * 2, u(gen) * 2}, {u(gen), u(gen), u(gen)}};
    if (r % 2 == 0) {  // half the rays aim at a triangle centroid, so most of them hit something
      const float* p = &pos[pick(gen) * 9];
      lr.dir = {(p[0] + p[3] + p[6]) / 3 - lr.origin.x, (p[1] + p[4] + p[7]) / 3 - lr.origin.y,
                (p[2] + p[5] + p[8]) / 3 - lr.origin.z};
    }
    double best = INFINITY;
    for (int t = 0; t < kTris; t++) {
      const float* p = &pos[t * 9];
      double tt = 0;
      if (raycast::intersectTriangleSided(lr, {p[0], p[1], p[2]}, {p[3], p[4], p[5]}, {p[6], p[7], p[8]},
                                          Side::Double, &tt) &&
          tt < best) {
        best = tt;
      }
    }
    raycast::LocalHit h;
    const bool got = bvh->raycastFirst(lr, Side::Double, 0, INFINITY, &h);
    if (std::isfinite(best)) hits++;
    if (got == std::isfinite(best) && (!got || std::fabs(h.t - best) < kEps)) agree++;
  }
  CHECK(hits > kRays / 4);
  CHECK(agree == kRays);
}

void testRaycastInstanciasEPodaPorEntrada() {
  raycast::RaycastWorld w;
  const int32_t g = w.addGeometry(quad());
  const int32_t s = w.addInstances();
  // duas instâncias: z = -2 e z = -6
  float inst[2 * raycast::kMatrixElements] = {1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -2, 1,
                                              1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -6, 1};
  w.instances(s)->set(inst, 2);
  raycast::Candidate c{g, Side::Front, s, kIdentity, 0};
  raycast::Hit h;
  CHECK(w.firstHit(ray({0, 0, 0}, {0, 0, -1}), &c, 1, &h));
  CHECK(h.instance == 0 && std::fabs(h.distance - 2) < kEps);
  // poda: a 2ª candidata entra (10) além do acerto da 1ª (2) — nem é testada
  const double far[raycast::kMatrixElements] = {1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -1, 1};
  raycast::Candidate two[2] = {c, {g, Side::Front, raycast::kNone, far, 10}};
  CHECK(w.firstHit(ray({0, 0, 0}, {0, 0, -1}), two, 2, &h));
  CHECK(h.candidate == 0);
  // ordem de entrada sem poda: a 2ª (z = -1) está mais perto e vence
  two[1].entry = 0.5;
  CHECK(w.firstHit(ray({0, 0, 0}, {0, 0, -1}), two, 2, &h));
  CHECK(h.candidate == 1 && std::fabs(h.distance - 1) < kEps);
  w.removeGeometry(g);
  CHECK(w.geometryCount() == 0);
  CHECK(!w.firstHit(ray({0, 0, 0}, {0, 0, -1}), &c, 1, &h));  // id apagado é ignorado
}

void testRaycastRecusaIndiceForaDoBuffer() {
  const uint32_t bad[] = {0, 1, 9};
  CHECK(raycast::TriangleBvh::build({kQuad, 3, 0, 4}, bad, 3) == nullptr);
}

}  // namespace tests
