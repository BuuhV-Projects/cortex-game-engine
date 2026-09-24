// Acumulados do coletor de lixo do Hermes (SPEC-0264).
//
// Existe para responder uma pergunta que o trace não respondia: a largada do
// kart-racer ficava 2 a 3x mais lenta em render E física juntos, e a suspeita é
// o coletor varrendo o heap no meio dos quadros. O callback de analytics do
// Hermes informa cada coleta; aqui ficam os totais que o JS lê por
// `__cortexGcStats()`.
//
// Atômicos porque o Hades (coletor do Hermes) coleta numa thread própria: o
// callback pode rodar fora da thread do JS.
#pragma once

#include <cstdint>
#include <string_view>

namespace core {

enum class GcGeneration { Young, Old };

/** Totais desde o boot. `oldWallMs` é parede: uma coleta concorrente longa aparece inteira. */
struct GcTotals {
  uint64_t youngCount = 0;
  uint64_t youngMs = 0;
  uint64_t oldCount = 0;
  uint64_t oldWallMs = 0;
  uint64_t oldCpuMs = 0;
};

/** Traduz o `collectionType` do Hermes. Só "young" é a geração nova; o resto ("old", "full") conta como velha. */
GcGeneration generationFromName(std::string_view collectionType);

/** Registra uma coleta. Seguro de chamar de qualquer thread. */
void recordGc(GcGeneration generation, uint64_t wallMs, uint64_t cpuMs);

/** Os totais agora. */
GcTotals gcTotals();

/** Zera os totais — só para teste. */
void resetGcTotals();

}  // namespace core
