// Ver shadow_caster_enumerator.h (SPEC-0245, passo 1).
#include "shadow_caster_enumerator.h"

#include <algorithm>
#include <cmath>

#include "sphere_math.h"

namespace scene {

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
