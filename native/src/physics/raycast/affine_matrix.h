// Matemática de matriz afim 4×4 coluna-maior (layout do `Matrix4.elements` do
// three) para o raycast nativo (SPEC-0347). Puro, sem dependência.
#pragma once

#include <algorithm>
#include <cmath>

namespace raycast {

constexpr int kMatrixElements = 16;

struct Vec3 {
  double x = 0;
  double y = 0;
  double z = 0;
};

inline Vec3 sub(const Vec3& a, const Vec3& b) { return {a.x - b.x, a.y - b.y, a.z - b.z}; }
inline double dot(const Vec3& a, const Vec3& b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
inline Vec3 cross(const Vec3& a, const Vec3& b) {
  return {a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x};
}

/** `Vector3.applyMatrix4` para matriz afim (sem divisão por w). */
inline Vec3 transformPoint(const double* m, const Vec3& p) {
  return {m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12], m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13],
          m[2] * p.x + m[6] * p.y + m[10] * p.z + m[14]};
}

/** Só o 3×3 (direção), SEM normalizar: o parâmetro do raio fica na escala de mundo. */
inline Vec3 transformDirection(const double* m, const Vec3& d) {
  return {m[0] * d.x + m[4] * d.y + m[8] * d.z, m[1] * d.x + m[5] * d.y + m[9] * d.z,
          m[2] * d.x + m[6] * d.y + m[10] * d.z};
}

/** `out = a × b` (coluna-maior, como `Matrix4.multiplyMatrices`). */
inline void multiplyMatrices(const double* a, const double* b, double* out) {
  constexpr int kDim = 4;
  for (int col = 0; col < kDim; col++) {
    for (int row = 0; row < kDim; row++) {
      double s = 0;
      for (int k = 0; k < kDim; k++) s += a[k * kDim + row] * b[col * kDim + k];
      out[col * kDim + row] = s;
    }
  }
}

/**
 * Inversa de matriz AFIM (3×3 por cofatores + translação). `false` quando o
 * determinante é 0 — o `three` devolve a matriz nula e nenhum triângulo acerta.
 */
inline bool invertAffine(const double* m, double* out) {
  const double a = m[0], b = m[4], c = m[8];
  const double d = m[1], e = m[5], f = m[9];
  const double g = m[2], h = m[6], i = m[10];
  const double c00 = e * i - f * h, c01 = c * h - b * i, c02 = b * f - c * e;
  const double det = a * c00 + b * (f * g - d * i) + c * (d * h - e * g);
  if (det == 0) return false;
  const double inv = 1 / det;
  const double r00 = c00 * inv, r01 = c01 * inv, r02 = c02 * inv;
  const double r10 = (f * g - d * i) * inv, r11 = (a * i - c * g) * inv, r12 = (c * d - a * f) * inv;
  const double r20 = (d * h - e * g) * inv, r21 = (b * g - a * h) * inv, r22 = (a * e - b * d) * inv;
  const double tx = m[12], ty = m[13], tz = m[14];
  out[0] = r00; out[4] = r01; out[8] = r02;
  out[1] = r10; out[5] = r11; out[9] = r12;
  out[2] = r20; out[6] = r21; out[10] = r22;
  out[3] = 0; out[7] = 0; out[11] = 0; out[15] = 1;
  out[12] = -(r00 * tx + r01 * ty + r02 * tz);
  out[13] = -(r10 * tx + r11 * ty + r12 * tz);
  out[14] = -(r20 * tx + r21 * ty + r22 * tz);
  return true;
}

/** `Matrix4.getMaxScaleOnAxis()`: o raio da esfera cresce pela MAIOR escala. */
inline double maxScaleOnAxis(const double* m) {
  const double xSq = m[0] * m[0] + m[1] * m[1] + m[2] * m[2];
  const double ySq = m[4] * m[4] + m[5] * m[5] + m[6] * m[6];
  const double zSq = m[8] * m[8] + m[9] * m[9] + m[10] * m[10];
  return std::sqrt(std::max(xSq, std::max(ySq, zSq)));
}

}  // namespace raycast
