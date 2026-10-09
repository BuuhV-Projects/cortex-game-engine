// Agregação do pass-timing (SPEC-0334). O bug que isto trava: slots além dos
// usados no quadro guardam timestamps de quadros antigos e inventavam passes
// ("64 passes/quadro" numa cena de ~7).
#include <array>
#include <cstdint>

#include "../src/webgpu/pass_timing_stats.h"
#include "harness.h"

namespace tests {

namespace {
constexpr uint64_t kInicioA = 1000;
constexpr uint64_t kFimA = 3000;  // 2000 ns, three
constexpr uint64_t kInicioB = 5000;
constexpr uint64_t kFimB = 5500;  // 500 ns, sombra
constexpr uint64_t kLixo = 9'000'000;  // slot de quadro antigo
}  // namespace

void testPassTimingIgnoresSlotsBeyondUsed() {
  using webgpu::PassOrigin;
  webgpu::PassTimingStats stats;
  // 2 passes usados; o 3º par é lixo de um quadro anterior.
  const std::array<uint64_t, 6> ts = {kInicioA, kFimA, kInicioB, kFimB, 1, kLixo};
  const std::array<PassOrigin, 3> origens = {PassOrigin::Js, PassOrigin::Shadow, PassOrigin::Bloom};
  stats.addFrame(ts.data(), 2, origens.data());
  CHECK(stats.quadros() == 1);
  CHECK(stats.passesUsados == 2);
  CHECK(stats.totalPorQuadro[0] == (kFimA - kInicioA) + (kFimB - kInicioB));
  CHECK(stats.nsPorOrigem[webgpu::indiceDaOrigem(PassOrigin::Js)] == kFimA - kInicioA);
  CHECK(stats.nsPorOrigem[webgpu::indiceDaOrigem(PassOrigin::Shadow)] == kFimB - kInicioB);
  CHECK(stats.nsPorOrigem[webgpu::indiceDaOrigem(PassOrigin::Bloom)] == 0);
  CHECK(stats.porPosicao[2].amostras == 0);
}

void testPassTimingSkipsInvalidPairs() {
  using webgpu::PassOrigin;
  webgpu::PassTimingStats stats;
  // Slot não escrito (0) e fim <= início não são duração.
  const std::array<uint64_t, 6> ts = {0, kFimA, kFimB, kInicioB, kInicioA, kFimA};
  const std::array<PassOrigin, 3> origens = {PassOrigin::Js, PassOrigin::Js, PassOrigin::Blit};
  stats.addFrame(ts.data(), 3, origens.data());
  CHECK(stats.totalPorQuadro[0] == kFimA - kInicioA);
  CHECK(stats.porPosicao[0].amostras == 0);
  CHECK(stats.porPosicao[1].amostras == 0);
  CHECK(stats.porPosicao[2].amostras == 1);
  stats.clear();
  CHECK(stats.quadros() == 0);
  CHECK(stats.passesUsados == 0);
}

}  // namespace tests
