// Árvore de volumes (BVH) de UMA geometria pro raycast nativo (SPEC-0347):
// triângulos copiados dos buffers do three (posição `float`, atributo comum ou
// intercalado), corte pela mediana do eixo mais longo dos centróides. Pura.
#pragma once

#include <cstddef>
#include <cstdint>
#include <memory>
#include <vector>

#include "ray_triangle.h"

namespace raycast {

/** Triângulos por folha da árvore. */
constexpr uint32_t kBvhLeafTriangles = 4;

/** Onde estão as posições dentro do buffer (em floats). */
struct PositionLayout {
  const float* data = nullptr;
  size_t stride = 0;       // floats entre um vértice e o próximo
  size_t offset = 0;       // floats até o x do 1º vértice
  size_t vertexCount = 0;
};

/** Esfera envolvente local (como o `computeBoundingSphere` do three). */
struct Sphere {
  Vec3 center;
  double radius = 0;
};

/** O 1º acerto local: parâmetro do raio e normal da face (local, a, b, c do three). */
struct LocalHit {
  double t = 0;
  Vec3 normal;
};

class TriangleBvh {
 public:
  /**
   * Monta a árvore. `index` nulo = triângulos sequenciais (0,1,2), (3,4,5)…
   * Devolve `nullptr` se algum índice sai do buffer ou não há triângulo.
   */
  static std::unique_ptr<TriangleBvh> build(const PositionLayout& positions, const uint32_t* index,
                                            size_t indexCount);

  /** 1º acerto com parâmetro em `[near, far]`; `false` se nenhum. */
  bool raycastFirst(const LocalRay& ray, Side side, double near, double far, LocalHit* out) const;

  const Sphere& sphere() const { return sphere_; }
  size_t triangleCount() const { return tris_.size() / kFloatsPerTriangle; }

 private:
  static constexpr size_t kFloatsPerTriangle = 9;
  struct Node {
    float min[3];
    float max[3];
    uint32_t first;  // folha: 1º triângulo; interno: filho da direita (o da esquerda é o seguinte)
    uint32_t count;  // 0 = nó interno
  };

  void buildNode(std::vector<uint32_t>& order, const std::vector<float>& centroids, uint32_t begin,
                 uint32_t end, const std::vector<float>& source);
  Vec3 vertex(uint32_t tri, int corner) const;

  std::vector<float> tris_;  // 9 floats por triângulo, na ordem das folhas
  std::vector<Node> nodes_;
  Sphere sphere_;
};

}  // namespace raycast
