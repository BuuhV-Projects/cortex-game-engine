// Política do coletor do Hermes (ADR-0153, ADR-0663, ADR-0689): o teto do heap e a ocupação-alvo, num lugar só para
// o embed e o teste lerem os mesmos números.
#pragma once

#include <algorithm>
#include <cstdint>

namespace core {

// Teto do heap (ADR-0663): perto do máximo do tipo (gcheapsize_t é de 32 bits). Conta a memória EXTERNA (ArrayBuffers
// de geometria e textura), não só os objetos JS.
constexpr uint32_t kMaxHeapBytes = 0xF0000000u;

// Ocupação-alvo do Hades (ADR-0689): a fração do heap que deve estar viva depois de uma coleta velha. O alvo da
// geração velha é (vivo + externo) / ocupação. Com o padrão (0,5) e ~2 GB de memória externa, o alvo passava do teto:
// a coleta velha só disparava com o lixo JS perto de 1,3 GB, colada no teto, e o DDD 00 fechou numa sessão de 21 min.
// A 0,7 a coleta dispara com ~0,55 GiB de lixo, ~1 GiB abaixo do teto. Acima de ~0,85 o alvo cola no vivo e o
// coletor volta a coletar sem parar (o problema do teto de 2 GB, ADR-0663).
constexpr double kOccupancyTarget = 0.7;

/** O alvo da geração velha (bytes) que o Hades calcula para `live` bytes vivos e `external` bytes externos. */
constexpr uint64_t oldGenTargetBytes(uint64_t live, uint64_t external, double occupancy = kOccupancyTarget) {
  const double target = static_cast<double>(live + external) / occupancy;
  return static_cast<uint64_t>(std::min(target, static_cast<double>(kMaxHeapBytes)));
}

}  // namespace core
