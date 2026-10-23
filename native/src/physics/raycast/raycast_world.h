// Raycast nativo de colisão (ADR-0346 / SPEC-0347): guarda as geometrias (BVH)
// e os conjuntos de instâncias por id e responde "1º acerto" de um raio contra
// uma lista de candidatas que o JS escolheu (`NearMeshIndex.alongRay`). Não tem
// estado de cena: a matriz de cada candidata vem na chamada (no export, a
// `matrixWorld.elements` já é a memória do espelho). Puro — testado no
// `cortex_host_tests`.
#pragma once

#include <cstddef>
#include <cstdint>
#include <memory>
#include <vector>

#include "instance_set.h"
#include "triangle_bvh.h"

namespace raycast {

/** Id de "sem instâncias" / "sem acerto". */
constexpr int32_t kNone = -1;

/** Raio em mundo: direção unitária (como no `Raycaster`). */
struct WorldRay {
  Vec3 origin;
  Vec3 dir;
  double near = 0;
  double far = 0;
};

struct Candidate {
  int32_t geometry = kNone;
  Side side = Side::Front;
  int32_t instances = kNone;
  const double* matrix = nullptr;  // matrixWorld (16, coluna-maior)
  double entry = 0;                // onde o raio entra na caixa (ordem crescente)
};

struct Hit {
  int32_t candidate = kNone;
  int32_t instance = kNone;
  double distance = 0;
  Vec3 point;   // mundo
  Vec3 normal;  // normal da face em espaço LOCAL (como o `three`)
};

class RaycastWorld {
 public:
  /** Guarda a geometria; devolve o id. */
  int32_t addGeometry(std::unique_ptr<TriangleBvh> bvh);
  void removeGeometry(int32_t id);
  int32_t addInstances();
  InstanceSet* instances(int32_t id);
  void removeInstances(int32_t id);
  size_t geometryCount() const { return liveGeometries_; }

  /**
   * 1º acerto entre as candidatas (em ordem de `entry`); para quando a próxima
   * entra além do melhor. Candidata com id desconhecido é ignorada.
   */
  bool firstHit(const WorldRay& ray, const Candidate* candidates, size_t count, Hit* out);

 private:
  const TriangleBvh* geometry(int32_t id) const;
  /** Testa a malha com matriz `world`; troca `*best` se acertar antes. */
  static bool testMesh(const TriangleBvh& bvh, Side side, const double* world, const WorldRay& ray, Hit* best,
                       bool haveBest);

  std::vector<std::unique_ptr<TriangleBvh>> geometries_;
  std::vector<int32_t> freeGeometries_;
  size_t liveGeometries_ = 0;
  std::vector<std::unique_ptr<InstanceSet>> instanceSets_;
  std::vector<int32_t> freeInstanceSets_;
};

}  // namespace raycast
