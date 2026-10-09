// Agregação dos timestamps de GPU por pass (SPEC-0254, corrigida na SPEC-0334).
//
// Separada do pass_timing.cpp para ser testável sem device: aqui só entra o
// buffer de timestamps já lido, quantos passes o quadro USOU e a origem de cada
// um. Era a parte errada: a versão anterior percorria TODOS os slots do query
// set, e os que o quadro não usou guardavam timestamps de quadros antigos — o
// relatório chegou a mostrar "64 passes/quadro" numa cena de ~7.
#pragma once

#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>
#include <vector>

namespace webgpu {

/**
 * Passes medidos por quadro. Acima do teto o pass fica sem medida e o
 * relatório diz quantos ("SEM SLOT") — número silencioso seria pior.
 */
constexpr uint32_t kMaxPassesPorFrame = 256;
/** Dois timestamps por pass: início e fim. */
constexpr uint32_t kSlotsPorPass = 2;

/**
 * Quem gravou o pass. O three não rotula os passes, então a origem é marcada
 * por quem chama o `beginRenderPass`: o JS (three) ou um dos passes do host.
 */
enum class PassOrigin : char {
  Js = 'j',      ///< passes do three (encoderBeginRenderPass do JS)
  Shadow = 's',  ///< passe de sombra depth-only em C++ (SPEC-0245)
  Bloom = 'b',   ///< bloom do host
  Clear = 'c',   ///< limpeza do offscreen do SSAA
  Blit = 'p',    ///< blit/composição final para a swapchain
};

/** Origens que o relatório lista, na ordem em que aparecem. */
constexpr std::array<PassOrigin, 5> kOrigensDoRelatorio = {PassOrigin::Js, PassOrigin::Shadow, PassOrigin::Bloom,
                                                           PassOrigin::Clear, PassOrigin::Blit};

/** Tamanho da tabela por origem: indexada pelo próprio caractere ASCII. */
constexpr size_t kOrigensPossiveis = 128;

inline size_t indiceDaOrigem(PassOrigin origem) {
  return static_cast<size_t>(static_cast<unsigned char>(origem)) % kOrigensPossiveis;
}

/** Acumulado de N quadros lidos. */
struct PassTimingStats {
  /** Estatística de um pass, por posição no quadro. */
  struct PorPosicao {
    uint64_t somaNs = 0;
    uint64_t maxNs = 0;
    uint32_t amostras = 0;
  };
  std::array<PorPosicao, kMaxPassesPorFrame> porPosicao{};
  /** ns de GPU somados por origem, em todos os quadros lidos. */
  std::array<uint64_t, kOrigensPossiveis> nsPorOrigem{};
  /** Tempo de GPU de cada quadro lido (soma dos seus passes), em ns. */
  std::vector<uint64_t> totalPorQuadro;
  /** Passes usados, somados em todos os quadros lidos. */
  uint64_t passesUsados = 0;

  /**
   * Agrega um quadro. Só os `usados` primeiros passes contam — os slots
   * seguintes têm lixo de quadros anteriores.
   *
   * @param timestamps `usados * kSlotsPorPass` valores (início, fim) em ns.
   * @param origens origem de cada um dos `usados` passes.
   */
  void addFrame(const uint64_t* timestamps, uint32_t usados, const PassOrigin* origens) {
    usados = std::min(usados, kMaxPassesPorFrame);
    uint64_t total = 0;
    for (uint32_t p = 0; p < usados; ++p) {
      const uint64_t inicio = timestamps[p * kSlotsPorPass];
      const uint64_t fim = timestamps[p * kSlotsPorPass + 1];
      // Zero = slot não escrito; fim <= início = timestamp inválido (o wgpu
      // permite, em recuperação de device). Nenhum dos dois é duração.
      if (inicio == 0 || fim <= inicio) continue;
      const uint64_t dur = fim - inicio;
      auto& acc = porPosicao[p];
      acc.somaNs += dur;
      acc.maxNs = std::max(acc.maxNs, dur);
      acc.amostras++;
      nsPorOrigem[indiceDaOrigem(origens[p])] += dur;
      total += dur;
    }
    passesUsados += usados;
    totalPorQuadro.push_back(total);
  }

  size_t quadros() const { return totalPorQuadro.size(); }

  void clear() { *this = PassTimingStats{}; }
};

}  // namespace webgpu
