// Acumulados do coletor (SPEC-0264). O que importa: coleta velha e nova em
// contadores separados, e o nome do Hermes classificado certo — "full" é
// coleta velha, e contá-la como nova esconderia justamente a coleta longa.
#include "../src/core/gc_policy.h"
#include "../src/core/gc_stats.h"
#include "harness.h"

namespace tests {

void testGcGenerationFromName() {
  using core::GcGeneration;
  using core::generationFromName;
  CHECK(generationFromName("young") == GcGeneration::Young);
  CHECK(generationFromName("old") == GcGeneration::Old);
  CHECK(generationFromName("full") == GcGeneration::Old);
}

void testGcTotalsSeparateGenerations() {
  core::resetGcTotals();
  core::recordGc(core::GcGeneration::Young, 3, 3);
  core::recordGc(core::GcGeneration::Young, 2, 2);
  core::recordGc(core::GcGeneration::Old, 14000, 900);
  const core::GcTotals t = core::gcTotals();
  CHECK(t.youngCount == 2);
  CHECK(t.youngMs == 5);
  CHECK(t.oldCount == 1);
  CHECK(t.oldWallMs == 14000);
  CHECK(t.oldCpuMs == 900);
  core::resetGcTotals();
  CHECK(core::gcTotals().oldCount == 0);
}

// ADR-0689: com a memória do DDD 00 (175 MB vivos, 2054 MB externos, medidos na volta pelo mapa), o alvo da coleta
// velha fica longe do teto. Com o padrão do Hades (0,5) ele colava no teto, e o jogo fechou perto dele.
void testGcOccupancyTargetKeepsMarginBelowCap() {
  constexpr uint64_t kMiB = 1024ull * 1024ull;
  constexpr uint64_t kLive = 175 * kMiB;
  constexpr uint64_t kExternal = 2054 * kMiB;
  // o alvo fica a ~656 MiB do teto; a coleta dispara a ~0,876 dele, ~1 GiB abaixo do teto
  constexpr uint64_t kMarginBytes = 512 * kMiB;
  CHECK(core::kOccupancyTarget > 0.5 && core::kOccupancyTarget < 0.85);
  CHECK(core::oldGenTargetBytes(kLive, kExternal, 0.5) == core::kMaxHeapBytes);
  CHECK(core::oldGenTargetBytes(kLive, kExternal) + kMarginBytes < core::kMaxHeapBytes);
  CHECK(core::oldGenTargetBytes(kLive, kExternal) > kLive + kExternal);
}

}  // namespace tests
