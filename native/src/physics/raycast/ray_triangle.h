// Teste raio × triângulo do three (`Ray.intersectTriangle`) portado literal —
// mesmos sinais e empates de borda, pra o nativo acertar o que o JS acerta
// (SPEC-0347). Puro.
#pragma once

#include "affine_matrix.h"

namespace raycast {

/** `material.side` do three. */
enum class Side : int { Front = 0, Back = 1, Double = 2 };

/** Raio em espaço local; `dir` NÃO é unitária (o parâmetro é a distância em mundo). */
struct LocalRay {
  Vec3 origin;
  Vec3 dir;
};

/**
 * `Ray.intersectTriangle(a, b, c, backfaceCulling)`: grava o parâmetro do raio
 * em `*t` e devolve `true` no acerto.
 */
inline bool intersectTriangle(const LocalRay& ray, const Vec3& a, const Vec3& b, const Vec3& c,
                              bool backfaceCulling, double* t) {
  const Vec3 edge1 = sub(b, a);
  const Vec3 edge2 = sub(c, a);
  const Vec3 normal = cross(edge1, edge2);
  double DdN = dot(ray.dir, normal);
  double sign;
  if (DdN > 0) {
    if (backfaceCulling) return false;
    sign = 1;
  } else if (DdN < 0) {
    sign = -1;
    DdN = -DdN;
  } else {
    return false;
  }
  const Vec3 diff = sub(ray.origin, a);
  const double DdQxE2 = sign * dot(ray.dir, cross(diff, edge2));
  if (DdQxE2 < 0) return false;
  const double DdE1xQ = sign * dot(ray.dir, cross(edge1, diff));
  if (DdE1xQ < 0) return false;
  if (DdQxE2 + DdE1xQ > DdN) return false;
  const double QdN = -sign * dot(diff, normal);
  if (QdN < 0) return false;
  *t = QdN / DdN;
  return true;
}

/** O teste com o lado da face do material, como o `Mesh` do three o chama. */
inline bool intersectTriangleSided(const LocalRay& ray, const Vec3& a, const Vec3& b, const Vec3& c, Side side,
                                   double* t) {
  if (side == Side::Back) return intersectTriangle(ray, c, b, a, true, t);
  return intersectTriangle(ray, a, b, c, side == Side::Front, t);
}

}  // namespace raycast
