// Ver world_versions.h (SPEC-0682).
#include "world_versions.h"

#include <limits>

namespace scene {

void WorldVersions::grow(size_t slots) {
  if (versions_.size() >= slots) return;
  photos_.resize(slots * kMatrixFloats, std::numeric_limits<double>::quiet_NaN());
  versions_.resize(slots, 0);
}

uint64_t WorldVersions::stamp(const SceneMirror& mirror, NodeIndex index) {
  const auto slot = static_cast<size_t>(index);
  grow(slot + 1);
  const double* world = mirror.worldMatrix(index);
  double* photo = &photos_[slot * kMatrixFloats];
  bool same = versions_[slot] != 0;
  // A mesma igualdade do `!==` do JS (0 e -0 iguais). NaN nunca é igual: a foto
  // de um slot novo difere de tudo, e um mundo com NaN ganha versão nova sempre.
  for (int i = 0; same && i < kMatrixFloats; i++) same = photo[i] == world[i];
  if (same) return versions_[slot];
  for (int i = 0; i < kMatrixFloats; i++) photo[i] = world[i];
  versions_[slot] = ++counter_;
  return versions_[slot];
}

}  // namespace scene
