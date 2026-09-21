// Testes do cache de pipeline (SPEC-0238).
//
// Sem device: o handle é um inteiro de mentira. O que se prova aqui é a lógica
// que o critério do marco exige — que a criação pare de acontecer.
#include "../src/render/pipeline_cache.h"

#include "harness.h"

namespace {

using FakePipeline = int;
using Cache = render::PipelineCache<FakePipeline>;

/** Chaves como o `PipelineKey.ts` as produz (valores, não ponteiros). */
constexpr render::PipelineKey kStandardOpaco = 0x0001;
constexpr render::PipelineKey kContornoOpaco = 0x0003;

}  // namespace

namespace tests {

void testPipelineCacheCriaUmaVezPorChave() {
  Cache cache;
  int criados = 0;
  const auto criar = [&criados]() { return ++criados; };

  const FakePipeline primeiro = cache.getOrCreate(kStandardOpaco, criar);
  const FakePipeline segundo = cache.getOrCreate(kStandardOpaco, criar);

  CHECK(primeiro == segundo);
  CHECK(criados == 1);
  CHECK(cache.size() == 1);
  CHECK(cache.hits() == 1);
  CHECK(cache.misses() == 1);
}

void testPipelineCacheSeparaChavesDiferentes() {
  Cache cache;
  int criados = 0;
  const auto criar = [&criados]() { return ++criados; };

  cache.getOrCreate(kStandardOpaco, criar);
  cache.getOrCreate(kContornoOpaco, criar);

  CHECK(criados == 2);
  CHECK(cache.size() == 2);
}

void testPipelineCacheNaoCriaNadaEmRegime() {
  // É o critério do M2, escrito como teste: depois do primeiro frame, um frame
  // inteiro não pode criar pipeline nenhum.
  Cache cache;
  int criados = 0;
  const auto criar = [&criados]() { return ++criados; };
  const render::PipelineKey chavesDoFrame[] = {kStandardOpaco, kContornoOpaco, kStandardOpaco};

  for (const auto chave : chavesDoFrame) cache.getOrCreate(chave, criar);  // primeiro frame
  cache.resetCounters();
  for (const auto chave : chavesDoFrame) cache.getOrCreate(chave, criar);  // regime

  CHECK(cache.misses() == 0);
  CHECK(cache.hits() == 3);
  CHECK(criados == 2);
}

void testPipelineCacheClearEsqueceTudo() {
  Cache cache;
  int criados = 0;
  const auto criar = [&criados]() { return ++criados; };
  cache.getOrCreate(kStandardOpaco, criar);

  cache.clear();
  cache.getOrCreate(kStandardOpaco, criar);

  // Depois de trocar de cena, criar de novo é o comportamento certo.
  CHECK(criados == 2);
  CHECK(cache.size() == 1);
}

}  // namespace tests
