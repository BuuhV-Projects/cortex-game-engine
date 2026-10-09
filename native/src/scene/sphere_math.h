// Matemática de esfera de recorte compartilhada pelos enumeradores do espelho
// (sombra: SPEC-0245; passe principal: SPEC-0332). Reproduz o `three`
// exatamente — divergir aqui tira da lista objetos que ele desenha.
#pragma once

#include <algorithm>
#include <cmath>

#include "scene_mirror.h"

namespace scene {

/**
 * `Matrix4.getMaxScaleOnAxis()` do three: o raio da esfera cresce pela MAIOR
 * das três escalas, não pela média.
 */
inline double maxScaleOnAxis(const double* m) {
  const double xSq = m[0] * m[0] + m[1] * m[1] + m[2] * m[2];
  const double ySq = m[4] * m[4] + m[5] * m[5] + m[6] * m[6];
  const double zSq = m[8] * m[8] + m[9] * m[9] + m[10] * m[10];
  return std::sqrt(std::max(xSq, std::max(ySq, zSq)));
}

/**
 * `Vector3.applyMatrix4()` para matriz AFIM (coluna-maior). Sem divisão por w:
 * as matrizes de mundo da cena são composição de posição, quatérnion e escala.
 */
inline void transformPoint(const double* m, const Bounds& b, double* outX, double* outY, double* outZ) {
  *outX = m[0] * b.cx + m[4] * b.cy + m[8] * b.cz + m[12];
  *outY = m[1] * b.cx + m[5] * b.cy + m[9] * b.cz + m[13];
  *outZ = m[2] * b.cx + m[6] * b.cy + m[10] * b.cz + m[14];
}

/** `Frustum.intersectsSphere()`: centro contra os 6 planos, com folga do raio. */
template <typename Plane>
bool intersectsSphere(const Plane* planes, double x, double y, double z, double radius) {
  for (int i = 0; i < kFrustumPlanes; i++) {
    const int p = i * 4;
    const double d = static_cast<double>(planes[p]) * x + static_cast<double>(planes[p + 1]) * y +
                     static_cast<double>(planes[p + 2]) * z + static_cast<double>(planes[p + 3]);
    if (d < -radius) return false;
  }
  return true;
}

}  // namespace scene
