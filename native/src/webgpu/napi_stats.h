// Contadores por-frame de chamadas ao shim WebGPU no caminho de render
// (draw-path) — SPEC-0134. Cada método WebGPU que o WebGPURenderer do three
// invoca é uma travessia JS→C++ (marshalling NAPI) com custo fixo; contar
// quantas acontecem por frame é o "juiz" do gargalo de render diagnosticado no
// PRD-0005 (M-perf-2). Single-thread (roda só na thread JS) — uint32 puro, sem
// atômico. O snapshot do ÚLTIMO frame completo é exposto em __cortexNapiStats();
// o frame corrente é zerado no runFrame via resetNapiStatsFrame().
#pragma once

#include <chrono>
#include <cstdint>

#include <node_api.h>

namespace webgpu {

// Chamadas por frame, por categoria. Zeradas a cada frame.
struct NapiFrameStats {
  uint32_t setPipeline = 0;
  uint32_t setBindGroup = 0;
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
inline void bumpSetBindGroup() { ++g_napiFrame.setBindGroup; }
inline void bumpSetVertexBuffer() { ++g_napiFrame.setVertexBuffer; }
inline void bumpSetIndexBuffer() { ++g_napiFrame.setIndexBuffer; }
inline void bumpDraw() { ++g_napiFrame.draw; }
inline void bumpDrawIndexed() { ++g_napiFrame.drawIndexed; }
inline void bumpWriteBuffer() { ++g_napiFrame.writeBuffer; }
inline void bumpSubmit() { ++g_napiFrame.submit; }

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

// Fecha o frame: snapshot do corrente → último e zera o corrente. Chamado no
// runFrame (main.cpp), depois do present.
void resetNapiStatsFrame();

// Instala __cortexNapiStats() no global (devolve o último frame completo).
void registerNapiStats(napi_env env);

}  // namespace webgpu
