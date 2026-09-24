// Acumulados do coletor (SPEC-0264). O que importa: coleta velha e nova em
// contadores separados, e o nome do Hermes classificado certo — "full" é
// coleta velha, e contá-la como nova esconderia justamente a coleta longa.
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

}  // namespace tests
