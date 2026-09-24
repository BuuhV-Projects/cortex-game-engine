#include "gpu_latency.h"

#include <SDL3/SDL.h>
#include <webgpu/webgpu.h>

#include <algorithm>
#include <cstdio>
#include <vector>

#include "../core/crash_handler.h"

namespace webgpu {
namespace {

/** Frames acumulados antes de cada linha no log — o mesmo ritmo do cronômetro
 * de fases, para as duas linhas ficarem lado a lado no arquivo. */
constexpr size_t kFramesPorRelatorio = 300;
/** Nanossegundos por milissegundo. */
constexpr double kNsPorMs = 1'000'000.0;
/** Percentil alto: o que se caça é o frame ruim, não a média. */
constexpr double kPercentilAlto = 0.95;
/**
 * Teto de frames aguardando aviso da GPU.
 *
 * Existe como guarda: se os callbacks parassem de chegar (driver em estado
 * ruim, evento não bombeado), a lista cresceria sem limite. Atingir o teto é
 * em si um sinal, e vai para o log.
 */
constexpr size_t kMaxPendentes = 256;

bool g_enabled = false;
/** Instante do submit de cada frame ainda sem resposta da GPU. */
std::vector<uint64_t> g_pendentes;
/** Latências medidas desde o último relatório, em ns. */
std::vector<uint64_t> g_amostras;
size_t g_descartadosPorTeto = 0;

void aoTerminar(WGPUQueueWorkDoneStatus status, WGPUStringView, void* userdata1, void*) {
  if (!g_enabled) return;
  const auto submetidoEm = reinterpret_cast<uint64_t>(userdata1);
  // Status diferente de sucesso ainda é informação de tempo: o frame saiu da
  // fila de algum jeito. Descartar esconderia justamente o caso anormal.
  (void)status;
  const uint64_t agora = SDL_GetTicksNS();
  if (agora > submetidoEm) g_amostras.push_back(agora - submetidoEm);
  if (!g_pendentes.empty()) g_pendentes.erase(g_pendentes.begin());
}

double percentil(const std::vector<uint64_t>& ordenado, double p) {
  if (ordenado.empty()) return 0.0;
  const size_t i = static_cast<size_t>(p * static_cast<double>(ordenado.size() - 1));
  return static_cast<double>(ordenado[i]) / kNsPorMs;
}

}  // namespace

void initGpuLatency() {
  g_enabled = SDL_getenv("CORTEX_FRAME_TIMING") != nullptr;
  if (!g_enabled) return;
  g_amostras.reserve(kFramesPorRelatorio);
  g_pendentes.reserve(kMaxPendentes);
}

bool gpuLatencyEnabled() { return g_enabled; }

void trackSubmittedFrame(WGPUQueueImpl* queue) {
  if (!g_enabled || queue == nullptr) return;
  if (g_pendentes.size() >= kMaxPendentes) {
    g_descartadosPorTeto++;
    return;
  }
  const uint64_t agora = SDL_GetTicksNS();
  g_pendentes.push_back(agora);
  WGPUQueueWorkDoneCallbackInfo info = WGPU_QUEUE_WORK_DONE_CALLBACK_INFO_INIT;
  // AllowProcessEvents: o callback só roda quando o host bombeia os eventos,
  // no ponto controlado do laço — nunca no meio de outra chamada wgpu.
  info.mode = WGPUCallbackMode_AllowProcessEvents;
  info.callback = aoTerminar;
  info.userdata1 = reinterpret_cast<void*>(agora);
  wgpuQueueOnSubmittedWorkDone(queue, info);
}

void pumpGpuLatency(WGPUInstanceImpl* instance) {
  if (!g_enabled || instance == nullptr) return;
  wgpuInstanceProcessEvents(instance);
}

bool reportGpuLatency() {
  if (!g_enabled || g_amostras.empty()) return false;
  std::sort(g_amostras.begin(), g_amostras.end());
  core::appendPerfLog("gpu-latency (%zu frames) | med=%.2f p95=%.2f max=%.2f | pendentes=%zu descartados=%zu",
                      g_amostras.size(), percentil(g_amostras, 0.5), percentil(g_amostras, kPercentilAlto),
                      percentil(g_amostras, 1.0), g_pendentes.size(), g_descartadosPorTeto);
  g_amostras.clear();
  g_descartadosPorTeto = 0;
  return true;
}

}  // namespace webgpu
