// Ver scene_mirror.h (SPEC-0233).
#include "scene_mirror.h"

#include <cstring>

namespace scene {
namespace {

constexpr int kMatrixFloats = 16;

/** compose() do three: quaternion + posição + escala numa matriz 4x4. */
void compose(float* m, const Transform& t) {
  const float x2 = t.qx + t.qx, y2 = t.qy + t.qy, z2 = t.qz + t.qz;
  const float xx = t.qx * x2, xy = t.qx * y2, xz = t.qx * z2;
  const float yy = t.qy * y2, yz = t.qy * z2, zz = t.qz * z2;
  const float wx = t.qw * x2, wy = t.qw * y2, wz = t.qw * z2;
  m[0] = (1 - (yy + zz)) * t.sx;
  m[1] = (xy + wz) * t.sx;
  m[2] = (xz - wy) * t.sx;
  m[3] = 0;
  m[4] = (xy - wz) * t.sy;
  m[5] = (1 - (xx + zz)) * t.sy;
  m[6] = (yz + wx) * t.sy;
  m[7] = 0;
  m[8] = (xz + wy) * t.sz;
  m[9] = (yz - wx) * t.sz;
  m[10] = (1 - (xx + yy)) * t.sz;
  m[11] = 0;
  m[12] = t.px;
  m[13] = t.py;
  m[14] = t.pz;
  m[15] = 1;
}

/** multiplyMatrices() do three: out = a × b (coluna-maior). */
void multiply(float* out, const float* a, const float* b) {
  for (int i = 0; i < 4; i++) {
    const float a0 = a[i], a1 = a[i + 4], a2 = a[i + 8], a3 = a[i + 12];
    out[i] = a0 * b[0] + a1 * b[1] + a2 * b[2] + a3 * b[3];
    out[i + 4] = a0 * b[4] + a1 * b[5] + a2 * b[6] + a3 * b[7];
    out[i + 8] = a0 * b[8] + a1 * b[9] + a2 * b[10] + a3 * b[11];
    out[i + 12] = a0 * b[12] + a1 * b[13] + a2 * b[14] + a3 * b[15];
  }
}

/** Esfera (centro + raio) contra os 6 planos. */
bool insideFrustum(const float* planes, float x, float y, float z, float radius) {
  for (int i = 0; i < kFrustumPlanes; i++) {
    const int p = i * 4;
    const float d = planes[p] * x + planes[p + 1] * y + planes[p + 2] * z + planes[p + 3];
    if (d < -radius) return false;
  }
  return true;
}

}  // namespace

bool SceneMirror::build(const std::vector<NodeDesc>& nodes) {
  const size_t count = nodes.size();
  parents_.resize(count);
  locals_.resize(count);
  radii_.resize(count);
  visibleFlags_.resize(count);
  local_.assign(count * kMatrixFloats, 0.0f);
  world_.assign(count * kMatrixFloats, 0.0f);
  dirty_.assign(count, 1);
  visible_.clear();
  visible_.reserve(count);

  for (size_t i = 0; i < count; i++) {
    const NodeDesc& node = nodes[i];
    // Contrato de ordem: pai antes de filho. Sem isto a propagação linear leria
    // a matriz de mundo do pai ainda não calculada — matriz errada em silêncio,
    // que é o pior modo de falhar.
    if (node.parent >= static_cast<NodeIndex>(i)) return false;
    if (node.parent < kNoParent) return false;
    parents_[i] = node.parent;
    locals_[i] = node.transform;
    radii_[i] = node.radius;
    visibleFlags_[i] = node.visible ? 1 : 0;
  }
  return true;
}

void SceneMirror::applyTransforms(const float* buffer, size_t floatCount) {
  const size_t count = floatCount / kSyncFloatsPerNode;
  for (size_t i = 0; i < count; i++) {
    const float* row = buffer + i * kSyncFloatsPerNode;
    const auto index = static_cast<size_t>(row[0]);
    if (index >= locals_.size()) continue;  // o JS pode estar à frente numa remoção
    Transform& t = locals_[index];
    t.px = row[1]; t.py = row[2]; t.pz = row[3];
    t.qx = row[4]; t.qy = row[5]; t.qz = row[6]; t.qw = row[7];
    t.sx = row[8]; t.sy = row[9]; t.sz = row[10];
    dirty_[index] = 1;
  }
}

int SceneMirror::updateAndCull(const float* viewProj, const float* planes) {
  visible_.clear();
  const size_t count = parents_.size();

  for (size_t i = 0; i < count; i++) {
    const NodeIndex parent = parents_[i];
    // Um nó precisa recompor a matriz de mundo se o transform dele mudou OU se
    // o pai mudou — e como o pai vem antes, a flag dele já está atualizada.
    const bool parentDirty = parent != kNoParent && dirty_[static_cast<size_t>(parent)] != 0;
    const bool selfDirty = dirty_[i] != 0;
    if (selfDirty) compose(&local_[i * kMatrixFloats], locals_[i]);
    if (selfDirty || parentDirty) {
      if (parent == kNoParent) {
        std::memcpy(&world_[i * kMatrixFloats], &local_[i * kMatrixFloats],
                    kMatrixFloats * sizeof(float));
      } else {
        multiply(&world_[i * kMatrixFloats], &world_[static_cast<size_t>(parent) * kMatrixFloats],
                 &local_[i * kMatrixFloats]);
      }
      dirty_[i] = 1;  // propaga para os filhos, que vêm depois
    }
  }

  // Os planos já vêm em espaço de MUNDO (o JS os deriva da viewProj uma vez
  // por frame), então o teste é direto contra a posição de mundo do nó — não há
  // matriz a multiplicar por objeto aqui.
  (void)viewProj;
  for (size_t i = 0; i < count; i++) {
    if (!visibleFlags_[i] || radii_[i] <= 0.0f) continue;
    const float* w = &world_[i * kMatrixFloats];
    if (insideFrustum(planes, w[12], w[13], w[14], radii_[i])) {
      visible_.push_back(static_cast<NodeIndex>(i));
    }
  }

  // As flags só podem ser limpas DEPOIS da propagação inteira: elas são o
  // canal que avisa o filho de que o pai se mexeu.
  std::memset(dirty_.data(), 0, dirty_.size());
  return static_cast<int>(visible_.size());
}

}  // namespace scene
