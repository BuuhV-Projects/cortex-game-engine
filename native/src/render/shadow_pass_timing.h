// Cronômetro de diagnóstico do passe de sombra nativo (SPEC-0690 §8).
//
// Com `CORTEX_SHADOW_PASS_TIMING=1`, cada `drawShadowPass` mede as etapas na
// CPU (enumerar, gate, montar os itens, preparar pipelines e uniformes, gravar
// os draws, fechar o pass e o encoder, submeter) e, a cada `kShadowTimingCalls`
// chamadas, imprime a média de cada uma em µs no stderr. Desligado, cada marca
// custa a leitura de um bool.
#pragma once

#include <chrono>
#include <cstdint>
#include <cstdio>
#include <cstdlib>

namespace render {

/** As etapas medidas, na ordem em que acontecem. */
enum class ShadowPhase : uint8_t { kEnumerate, kGate, kItems, kPrepare, kEncode, kFinish, kSubmit, kCount };

/** Chamadas por linha de relato (≈ 5 s de jogo com duas cascatas a 60 fps). */
constexpr uint32_t kShadowTimingCalls = 300;
constexpr double kNanosPerMicro = 1000.0;

class ShadowPassTiming {
 public:
  static ShadowPassTiming& instance() {
    static ShadowPassTiming timing;
    return timing;
  }

  /** Começa uma chamada: as marcas seguintes medem a partir daqui. */
  void begin() {
    if (enabled_) last_ = Clock::now();
  }

  /** Fecha a etapa `phase`: soma o tempo desde a marca anterior. */
  void mark(ShadowPhase phase) {
    if (!enabled_) return;
    const Clock::time_point now = Clock::now();
    totals_[static_cast<int>(phase)] += std::chrono::duration<double, std::nano>(now - last_).count();
    last_ = now;
  }

  /** Fim de uma chamada desenhada; a cada `kShadowTimingCalls` imprime as médias e zera. */
  void end() {
    if (!enabled_ || ++calls_ < kShadowTimingCalls) return;
    static const char* const kNames[] = {"enumerar", "gate", "itens", "preparar", "gravar", "fechar", "submeter"};
    std::fprintf(stderr, "[shadow-timing] %u chamadas (us/chamada):", calls_);
    for (int i = 0; i < static_cast<int>(ShadowPhase::kCount); ++i) {
      std::fprintf(stderr, " %s=%.1f", kNames[i], totals_[i] / calls_ / kNanosPerMicro);
      totals_[i] = 0;
    }
    std::fprintf(stderr, "\n");
    std::fflush(stderr);
    calls_ = 0;
  }

 private:
  using Clock = std::chrono::steady_clock;
  ShadowPassTiming() : enabled_(std::getenv("CORTEX_SHADOW_PASS_TIMING") != nullptr) {}

  bool enabled_;
  Clock::time_point last_{};
  double totals_[static_cast<int>(ShadowPhase::kCount)] = {};
  uint32_t calls_ = 0;
};

}  // namespace render
