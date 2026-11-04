// Ver main_pass_culler.h (SPEC-0332).
#include "main_pass_culler.h"

#include "sphere_math.h"

namespace scene {
namespace {

/** Linha z da view-projection (coluna-maior): elementos 2, 6, 10, 14. */
constexpr int kRowZ0 = 2;
constexpr int kRowZ1 = 6;
constexpr int kRowZ2 = 10;
constexpr int kRowZ3 = 14;

/** O nó entra na lista sem culling em C++ (luz, ou culling decidido pelo JS). */
bool isPassThrough(uint16_t flags) { return (flags & (kNodeLight | kNodeMainJsCull)) != 0; }

}  // namespace

double sortDepth(const double* viewProj, double x, double y, double z) {
  return viewProj[kRowZ0] * x + viewProj[kRowZ1] * y + viewProj[kRowZ2] * z + viewProj[kRowZ3];
}

int MainPassCuller::cull(const SceneMirror& mirror, const double* planes, const double* viewProj,
                         uint32_t cameraLayers) {
  const size_t count = mirror.size();
  effectiveVisible_.assign(count, 0);
  candidates_.clear();
  refusedAt_ = kNoParent;

  for (size_t i = 0; i < count; i++) {
    const auto index = static_cast<NodeIndex>(i);
    const NodeIndex parent = mirror.parent(index);
    // `visible === false` poda a subárvore inteira — e lápide é invisível.
    const bool parentVisible = parent == kNoParent || effectiveVisible_[static_cast<size_t>(parent)] != 0;
    if (!parentVisible || !mirror.visibleFlag(index)) continue;
    effectiveVisible_[i] = 1;

    // Alcançável e fora do que se reproduz: o frame inteiro volta ao `three`.
    if ((mirror.mainFrameFlags(index) & kMainUnsupported) != 0) {
      refusedAt_ = index;
      candidates_.clear();
      return kMainCullRefused;
    }

    // `Layers.test` do `three` (SPEC-0686): fora das camadas da câmera o nó não
    // entra, mas a subárvore continua (a camada não poda os filhos).
    if ((slots_.layers(index) & cameraLayers) == 0) continue;

    const uint16_t flags = mirror.flags(index);
    // Quem o `three` corta pela esfera do OBJETO, quando o JS a mandou (SPEC-0686).
    const ObjectSphere* own = (flags & kNodeMainJsCull) != 0 ? slots_.objectSphere(index) : nullptr;
    if (own == nullptr && isPassThrough(flags)) {
      candidates_.push_back({index, 0});
      continue;
    }
    if (own == nullptr && (flags & kNodeMainCull) == 0) continue;

    const double* world = mirror.worldMatrix(index);
    const Bounds& local = own != nullptr ? own->cull : mirror.bounds(index);
    double cx = 0, cy = 0, cz = 0;
    transformPoint(world, local, &cx, &cy, &cz);
    if ((mirror.mainFrameFlags(index) & kMainFrustumCulled) != 0 &&
        !intersectsSphere(planes, cx, cy, cz, local.radius * maxScaleOnAxis(world))) {
      continue;
    }
    // O `z` do `three` é sempre o do centro da esfera da GEOMETRIA (`_projectObject`).
    if (own != nullptr) transformPoint(world, Bounds{own->depthX, own->depthY, own->depthZ, 0}, &cx, &cy, &cz);
    candidates_.push_back({index, sortDepth(viewProj, cx, cy, cz)});
  }
  // Só no quadro aceito (SPEC-0682): a recusa não mexe nas fotos.
  for (MainCandidate& c : candidates_) c.worldVersion = versions_.stamp(mirror, c.index);
  return static_cast<int>(candidates_.size());
}

}  // namespace scene
