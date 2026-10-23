// Ver triangle_bvh.h (SPEC-0347).
#include "triangle_bvh.h"

#include <algorithm>
#include <cmath>
#include <limits>

namespace raycast {
namespace {

constexpr int kAxes = 3;
constexpr int kCorners = 3;
/** Profundidade máxima da pilha de travessia (mediana: log2 de 2^32 triângulos sobra). */
constexpr int kTraversalStack = 64;

struct Box {
  double min[kAxes];
  double max[kAxes];
};

/** Slab raio × caixa: devolve a entrada (`*enter`) se o trecho [near, far] cruza a caixa. */
bool rayHitsBox(const LocalRay& ray, const float* bmin, const float* bmax, double near, double far, double* enter) {
  const double o[kAxes] = {ray.origin.x, ray.origin.y, ray.origin.z};
  const double d[kAxes] = {ray.dir.x, ray.dir.y, ray.dir.z};
  double t0 = near, t1 = far;
  for (int a = 0; a < kAxes; a++) {
    if (d[a] == 0) {
      if (o[a] < bmin[a] || o[a] > bmax[a]) return false;
      continue;
    }
    const double ta = (bmin[a] - o[a]) / d[a];
    const double tb = (bmax[a] - o[a]) / d[a];
    t0 = std::max(t0, std::min(ta, tb));
    t1 = std::min(t1, std::max(ta, tb));
    if (t0 > t1) return false;
  }
  *enter = t0;
  return true;
}

/** `Triangle.getNormal(a, b, c)` do three: (c − b) × (a − b), normalizada; nula se degenerada. */
Vec3 faceNormal(const Vec3& a, const Vec3& b, const Vec3& c) {
  const Vec3 n = cross(sub(c, b), sub(a, b));
  const double lenSq = dot(n, n);
  if (lenSq <= 0) return {};
  const double inv = 1 / std::sqrt(lenSq);
  return {n.x * inv, n.y * inv, n.z * inv};
}

Sphere boundingSphere(const PositionLayout& p) {
  Box box{};
  for (int a = 0; a < kAxes; a++) {
    box.min[a] = std::numeric_limits<double>::infinity();
    box.max[a] = -std::numeric_limits<double>::infinity();
  }
  for (size_t v = 0; v < p.vertexCount; v++) {
    const float* xyz = p.data + p.offset + v * p.stride;
    for (int a = 0; a < kAxes; a++) {
      box.min[a] = std::min(box.min[a], static_cast<double>(xyz[a]));
      box.max[a] = std::max(box.max[a], static_cast<double>(xyz[a]));
    }
  }
  constexpr double kHalf = 0.5;
  Sphere s;
  s.center = {(box.min[0] + box.max[0]) * kHalf, (box.min[1] + box.max[1]) * kHalf,
              (box.min[2] + box.max[2]) * kHalf};
  double maxSq = 0;
  for (size_t v = 0; v < p.vertexCount; v++) {
    const float* xyz = p.data + p.offset + v * p.stride;
    const Vec3 d = sub({xyz[0], xyz[1], xyz[2]}, s.center);
    maxSq = std::max(maxSq, dot(d, d));
  }
  s.radius = std::sqrt(maxSq);
  return s;
}

}  // namespace

std::unique_ptr<TriangleBvh> TriangleBvh::build(const PositionLayout& positions, const uint32_t* index,
                                                size_t indexCount) {
  if (positions.data == nullptr || positions.vertexCount == 0) return nullptr;
  const size_t triCount = (index ? indexCount : positions.vertexCount) / kCorners;
  if (triCount == 0) return nullptr;
  std::vector<float> source(triCount * kFloatsPerTriangle);
  std::vector<float> centroids(triCount * kAxes);
  for (size_t t = 0; t < triCount; t++) {
    for (int k = 0; k < kCorners; k++) {
      const size_t slot = t * kCorners + k;
      const size_t v = index ? index[slot] : slot;
      if (v >= positions.vertexCount) return nullptr;
      const float* xyz = positions.data + positions.offset + v * positions.stride;
      for (int a = 0; a < kAxes; a++) {
        source[t * kFloatsPerTriangle + k * kAxes + a] = xyz[a];
        centroids[t * kAxes + a] += xyz[a] / kCorners;
      }
    }
  }
  auto bvh = std::unique_ptr<TriangleBvh>(new TriangleBvh());
  bvh->tris_.reserve(source.size());
  bvh->nodes_.reserve(2 * triCount / kBvhLeafTriangles + 1);
  std::vector<uint32_t> order(triCount);
  for (uint32_t t = 0; t < triCount; t++) order[t] = t;
  bvh->buildNode(order, centroids, 0, static_cast<uint32_t>(triCount), source);
  bvh->sphere_ = boundingSphere(positions);
  return bvh;
}

void TriangleBvh::buildNode(std::vector<uint32_t>& order, const std::vector<float>& centroids, uint32_t begin,
                            uint32_t end, const std::vector<float>& source) {
  const auto nodeIndex = static_cast<uint32_t>(nodes_.size());
  nodes_.push_back({});
  Box box{}, cbox{};
  for (int a = 0; a < kAxes; a++) {
    box.min[a] = cbox.min[a] = std::numeric_limits<double>::infinity();
    box.max[a] = cbox.max[a] = -std::numeric_limits<double>::infinity();
  }
  for (uint32_t i = begin; i < end; i++) {
    const float* tri = &source[order[i] * kFloatsPerTriangle];
    for (int k = 0; k < kCorners; k++) {
      for (int a = 0; a < kAxes; a++) {
        box.min[a] = std::min(box.min[a], static_cast<double>(tri[k * kAxes + a]));
        box.max[a] = std::max(box.max[a], static_cast<double>(tri[k * kAxes + a]));
      }
    }
    for (int a = 0; a < kAxes; a++) {
      cbox.min[a] = std::min(cbox.min[a], static_cast<double>(centroids[order[i] * kAxes + a]));
      cbox.max[a] = std::max(cbox.max[a], static_cast<double>(centroids[order[i] * kAxes + a]));
    }
  }
  Node node{};
  for (int a = 0; a < kAxes; a++) {
    node.min[a] = static_cast<float>(box.min[a]);  // vértices já são float: exato
    node.max[a] = static_cast<float>(box.max[a]);
  }
  int axis = 0;
  for (int a = 1; a < kAxes; a++) {
    if (cbox.max[a] - cbox.min[a] > cbox.max[axis] - cbox.min[axis]) axis = a;
  }
  const bool flat = !(cbox.max[axis] > cbox.min[axis]);  // centróides iguais: não há corte útil
  if (end - begin <= kBvhLeafTriangles || flat) {
    node.first = static_cast<uint32_t>(tris_.size() / kFloatsPerTriangle);
    node.count = end - begin;
    for (uint32_t i = begin; i < end; i++) {
      const float* tri = &source[order[i] * kFloatsPerTriangle];
      tris_.insert(tris_.end(), tri, tri + kFloatsPerTriangle);
    }
    nodes_[nodeIndex] = node;
    return;
  }
  const uint32_t mid = begin + (end - begin) / 2;
  std::nth_element(order.begin() + begin, order.begin() + mid, order.begin() + end, [&](uint32_t x, uint32_t y) {
    return centroids[x * kAxes + axis] < centroids[y * kAxes + axis];
  });
  nodes_[nodeIndex] = node;
  buildNode(order, centroids, begin, mid, source);  // esquerda = nodeIndex + 1
  nodes_[nodeIndex].first = static_cast<uint32_t>(nodes_.size());
  nodes_[nodeIndex].count = 0;
  buildNode(order, centroids, mid, end, source);
}

Vec3 TriangleBvh::vertex(uint32_t tri, int corner) const {
  const float* p = &tris_[tri * kFloatsPerTriangle + corner * kAxes];
  return {p[0], p[1], p[2]};
}

bool TriangleBvh::raycastFirst(const LocalRay& ray, Side side, double near, double far, LocalHit* out) const {
  if (nodes_.empty()) return false;
  uint32_t stack[kTraversalStack];
  int top = 0;
  stack[top++] = 0;
  double best = far;
  bool found = false;
  uint32_t bestTri = 0;
  while (top > 0) {
    const Node& n = nodes_[stack[--top]];
    double enter = 0;
    if (!rayHitsBox(ray, n.min, n.max, near, best, &enter)) continue;
    if (n.count > 0) {
      for (uint32_t i = 0; i < n.count; i++) {
        const uint32_t tri = n.first + i;
        double t = 0;
        if (!intersectTriangleSided(ray, vertex(tri, 0), vertex(tri, 1), vertex(tri, 2), side, &t)) continue;
        if (t < near || t > best || (found && t == best)) continue;
        best = t;
        bestTri = tri;
        found = true;
      }
      continue;
    }
    const auto self = static_cast<uint32_t>(&n - nodes_.data());
    const uint32_t left = self + 1, right = n.first;
    if (top + 2 > kTraversalStack) return false;  // não acontece com corte pela mediana
    // o mais perto por último na pilha = visitado primeiro
    double enterLeft = 0, enterRight = 0;
    const bool hitLeft = rayHitsBox(ray, nodes_[left].min, nodes_[left].max, near, best, &enterLeft);
    const bool hitRight = rayHitsBox(ray, nodes_[right].min, nodes_[right].max, near, best, &enterRight);
    if (hitLeft && hitRight) {
      const bool leftFirst = enterLeft <= enterRight;
      stack[top++] = leftFirst ? right : left;
      stack[top++] = leftFirst ? left : right;
    } else if (hitLeft) {
      stack[top++] = left;
    } else if (hitRight) {
      stack[top++] = right;
    }
  }
  if (!found) return false;
  out->t = best;
  out->normal = faceNormal(vertex(bestTri, 0), vertex(bestTri, 1), vertex(bestTri, 2));
  return true;
}

}  // namespace raycast
