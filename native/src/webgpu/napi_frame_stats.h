// Contadores por-frame de chamadas ao shim WebGPU no caminho de render
// (draw-path) — SPEC-0134. Cada método WebGPU que o WebGPURenderer do three
// invoca é uma travessia JS→C++ (marshalling NAPI) com custo fixo; contar
// quantas acontecem por frame é o "juiz" do gargalo de render diagnosticado no
// PRD-0005 (M-perf-2). Single-thread (roda só na thread JS) — uint32 puro, sem
// atômico.
//
// Sem dependência de NAPI de propósito (SPEC-0688): o cortex_host_tests testa a
// contagem sem montar um env. A exposição ao JS fica em napi_stats.h.
#pragma once

#include <chrono>
#include <cstdint>

namespace webgpu {

// Chamadas por frame, por categoria. Zeradas a cada frame.
struct NapiFrameStats {
  uint32_t setPipeline = 0;
  // TODAS as setBindGroup: as da chamada JS e as do replay em C++ do draw
  // batch. É o `napiBind` do trace, com o mesmo significado de sempre.
  uint32_t setBindGroup = 0;
  // Das de cima, as do replay em C++ (draw_batch_shim, SPEC-0688). As do JS
  // são a diferença: setBindGroupJs().
  uint32_t setBindGroupReplay = 0;
  uint32_t setVertexBuffer = 0;
  uint32_t setIndexBuffer = 0;
  uint32_t draw = 0;
  uint32_t drawIndexed = 0;
  uint32_t writeBuffer = 0;
  uint32_t submit = 0;
  // Tempo somado DENTRO das funcoes instrumentadas, em nanossegundos
  // (SPEC-0225). Responde quanto dos ~68 us por draw e a ponte e quanto e o
  // `three` em JS antes de chegar aqui.
  uint64_t nanos = 0;
};

// Acumulador do frame corrente (definido no .cpp). Incrementado pelos bump*().
extern NapiFrameStats g_napiFrame;

inline void bumpSetPipeline() { ++g_napiFrame.setPipeline; }
// Chamada JS (commands.cpp): conta só no total.
inline void bumpSetBindGroup() { ++g_napiFrame.setBindGroup; }
// Replay em C++ do draw batch: conta no total E no replay.
inline void bumpSetBindGroupReplay() {
  ++g_napiFrame.setBindGroup;
  ++g_napiFrame.setBindGroupReplay;
}
inline void bumpSetVertexBuffer() { ++g_napiFrame.setVertexBuffer; }
inline void bumpSetIndexBuffer() { ++g_napiFrame.setIndexBuffer; }
inline void bumpDraw() { ++g_napiFrame.draw; }
inline void bumpDrawIndexed() { ++g_napiFrame.drawIndexed; }
inline void bumpWriteBuffer() { ++g_napiFrame.writeBuffer; }
inline void bumpSubmit() { ++g_napiFrame.submit; }

// As setBindGroup que vieram da chamada JS.
inline uint32_t setBindGroupJs(const NapiFrameStats& stats) {
  return stats.setBindGroup - stats.setBindGroupReplay;
}

// Cronometro de escopo: declarado na PRIMEIRA linha de um callback NAPI do
// caminho de render, soma ao frame o tempo gasto ali dentro — incluindo o
// marshalling dos argumentos, que e justamente o custo em questao.
//
// Nao conta: a contagem segue nos bump*(), alguns deles condicionais (so
// contam quando a validacao passa). Contagem e tempo medem coisas
// ligeiramente diferentes, de proposito.
class NapiTimer {
 public:
  NapiTimer() : inicio_(std::chrono::steady_clock::now()) {}
  ~NapiTimer() {
    g_napiFrame.nanos += static_cast<uint64_t>(
        std::chrono::duration_cast<std::chrono::nanoseconds>(
            std::chrono::steady_clock::now() - inicio_)
            .count());
  }
  NapiTimer(const NapiTimer&) = delete;
  NapiTimer& operator=(const NapiTimer&) = delete;

 private:
  std::chrono::steady_clock::time_point inicio_;
};

}  // namespace webgpu
