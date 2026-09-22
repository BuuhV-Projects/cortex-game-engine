// Ver shadow_caster_enumerator.h (SPEC-0245, passo 1).
#include "shadow_caster_enumerator.h"

#include <algorithm>
#include <cmath>

namespace scene {
namespace {

/**
 * `Matrix4.getMaxScaleOnAxis()` do three: o raio da esfera cresce pela MAIOR
 * das três escalas, não pela média. Usar outra coisa aqui daria um raio menor
 * que o do `three` e tiraria da lista objetos que ele desenha.
 */
double maxScaleOnAxis(const double* m) {
  const double xSq = m[0] * m[0] + m[1] * m[1] + m[2] * m[2];
  const double ySq = m[4] * m[4] + m[5] * m[5] + m[6] * m[6];
  const double zSq = m[8] * m[8] + m[9] * m[9] + m[10] * m[10];
  return std::sqrt(std::max(xSq, std::max(ySq, zSq)));
}

/**
 * `Vector3.applyMatrix4()` para matriz AFIM (coluna-maior, como no three).
 *
 * Sem divisão por w: as matrizes de mundo da cena são afins por construção
 * (composição de posição, quatérnion e escala), então a última linha é
 * `0 0 0 1` e a divisão seria por 1.
 */
void transformPoint(const double* m, const Bounds& b, double* outX, double* outY, double* outZ) {
  *outX = m[0] * b.cx + m[4] * b.cy + m[8] * b.cz + m[12];
  *outY = m[1] * b.cx + m[5] * b.cy + m[9] * b.cz + m[13];
  *outZ = m[2] * b.cx + m[6] * b.cy + m[10] * b.cz + m[14];
}

/** `Frustum.intersectsSphere()`: centro contra os 6 planos, com folga do raio. */
bool intersectsSphere(const float* planes, double x, double y, double z, double radius) {
  for (int i = 0; i < kFrustumPlanes; i++) {
    const int p = i * 4;
    const double d = static_cast<double>(planes[p]) * x + static_cast<double>(planes[p + 1]) * y +
                     static_cast<double>(planes[p + 2]) * z + static_cast<double>(planes[p + 3]);
    if (d < -radius) return false;
  }
  return true;
}

}  // namespace

bool shouldCastShadow(double radius, double distance, double minRatio) {
  if (minRatio <= 0) return true;
  return radius / std::max(distance, kMinCasterDistance) >= minRatio;
}

int ShadowCasterEnumerator::enumerate(const SceneMirror& mirror, const ShadowCasterParams& params,
                                      const float* shadowPlanes) {
  const size_t count = mirror.size();
  effectiveVisible_.assign(count, 0);
  casters_.clear();
  if (shadowPlanes == nullptr) return 0;

  for (size_t i = 0; i < count; i++) {
    const auto index = static_cast<NodeIndex>(i);
    // Visibilidade HERDADA: o `three` volta na porta em `_projectObject` e a
    // subárvore inteira some junto. Como pai vem antes de filho, uma passada
    // linear basta — e é por isso que a checagem mora aqui e não num traverse.
    const NodeIndex parent = mirror.parent(index);
    const bool parentVisible = parent == kNoParent || effectiveVisible_[static_cast<size_t>(parent)] != 0;
    const bool visible = parentVisible && mirror.visibleFlag(index);
    effectiveVisible_[i] = visible ? 1 : 0;
    if (!visible) continue;

    // Só malha desenhável entra na RenderList. Group, luz, câmera e osso
    // atravessam a cena inteira sem produzir um draw sequer.
    if (!mirror.hasFlag(index, kNodeDrawable)) continue;
    // `material.visible` é do FRAME, não do `build`: o `three` o reavalia a
    // cada travessia, e um material desligado em runtime sairia da imagem mas
    // continuaria projetando sombra aqui.
    if (!mirror.materialVisibleFlag(index)) continue;
    // Autoria vence (SPEC-0197): quem o autor desligou nunca volta.
    if (!mirror.hasFlag(index, kNodeCastShadow)) continue;

    const double* world = mirror.worldMatrix(index);
    const Bounds& local = mirror.bounds(index);
    double cx = 0, cy = 0, cz = 0;
    transformPoint(world, local, &cx, &cy, &cz);
    const double radius = local.radius * maxScaleOnAxis(world);

    // Filtro 1 — tamanho angular contra a câmera do JOGO. Skinada e instanced
    // ficam de fora: o bounding sphere delas mente (rig / uma instância só).
    if (!mirror.hasFlag(index, kNodeSkipAngularCull)) {
      const double dx = cx - params.cameraX;
      const double dy = cy - params.cameraY;
      const double dz = cz - params.cameraZ;
      const double distance = std::sqrt(dx * dx + dy * dy + dz * dz);
      if (!shouldCastShadow(radius, distance, params.minRatio)) continue;
    }

    // Filtro 2 — frustum da ortho da CASCATA. `frustumCulled = false` é a
    // fuga que o `three` dá a quem não pode ser cortado (céu, helper).
    if (mirror.hasFlag(index, kNodeFrustumCulled) &&
        !intersectsSphere(shadowPlanes, cx, cy, cz, radius)) {
      continue;
    }

    casters_.push_back(index);
  }

  return static_cast<int>(casters_.size());
}

}  // namespace scene
