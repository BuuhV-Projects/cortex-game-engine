#include "frame_timing.h"

#include <SDL3/SDL.h>

#include <algorithm>
#include <array>
#include <cstdio>
#include <vector>

#include "crash_handler.h"
#include "../webgpu/gpu_latency.h"

namespace core {
namespace {

/** Frames acumulados antes de cada linha no log. ~5 s a 60 fps, igual ao
 * ritmo que o perf-log já usa para o heap (main.cpp). */
constexpr size_t kFramesPorRelatorio = 300;
/** Nanossegundos por milissegundo — a conversão da saída. */
constexpr double kNsPorMs = 1'000'000.0;
/** Percentil alto do relatório. O que se caça é variância, não custo médio:
 * a média esconde exatamente o frame ruim que o jogador sente. */
constexpr double kPercentilAlto = 0.95;

constexpr size_t kFases = static_cast<size_t>(FramePhase::kCount);
constexpr std::array<const char*, kFases> kNomes = {"poll", "js", "present", "resto"};

bool g_enabled = false;
uint64_t g_frameStartNs = 0;
uint64_t g_ultimaMarcaNs = 0;
/** Amostras por fase, em ns, desde o último relatório. */
std::array<std::vector<uint64_t>, kFases> g_amostras;
size_t g_frames = 0;
size_t g_apresentados = 0;

/** Valor do percentil num vetor JÁ ordenado. Vazio devolve 0. */
double percentil(const std::vector<uint64_t>& ordenado, double p) {
  if (ordenado.empty()) return 0.0;
  const size_t i = static_cast<size_t>(p * static_cast<double>(ordenado.size() - 1));
  return static_cast<double>(ordenado[i]) / kNsPorMs;
}

void relatar() {
  char linha[512];
  int escrito = std::snprintf(linha, sizeof(linha), "frame-timing (%zu frames, %zu apresentados)",
                              g_frames, g_apresentados);
  for (size_t i = 0; i < kFases; ++i) {
    auto& amostras = g_amostras[i];
    std::sort(amostras.begin(), amostras.end());
    const int n = std::snprintf(linha + escrito, sizeof(linha) - static_cast<size_t>(escrito),
                                " | %s med=%.2f p95=%.2f", kNomes[i],
                                percentil(amostras, 0.5), percentil(amostras, kPercentilAlto));
    if (n > 0) escrito += n;
    amostras.clear();
  }
  // "%s" e nao `linha` direto: a linha traz `%` nenhum hoje, mas passar dado
  // como formato e a porta de entrada classica de corrupcao de pilha.
  appendPerfLog("%s", linha);
  // A latência da GPU sai na linha seguinte, no mesmo ritmo: as duas juntas é
  // que respondem "o frame demorou onde" (SPEC-0253).
  webgpu::reportGpuLatency();
  g_frames = 0;
  g_apresentados = 0;
}

}  // namespace

void initFrameTiming() {
  g_enabled = SDL_getenv("CORTEX_FRAME_TIMING") != nullptr;
  if (!g_enabled) return;
  for (auto& amostras : g_amostras) amostras.reserve(kFramesPorRelatorio);
}

bool frameTimingEnabled() { return g_enabled; }

void beginFrameTiming() {
  if (!g_enabled) return;
  g_frameStartNs = SDL_GetTicksNS();
  g_ultimaMarcaNs = g_frameStartNs;
}

void markFramePhase(FramePhase phase) {
  if (!g_enabled) return;
  const uint64_t agora = SDL_GetTicksNS();
  g_amostras[static_cast<size_t>(phase)].push_back(agora - g_ultimaMarcaNs);
  g_ultimaMarcaNs = agora;
}

void endFrameTiming(bool presented) {
  if (!g_enabled) return;
  g_frames++;
  if (presented) g_apresentados++;
  if (g_frames >= kFramesPorRelatorio) relatar();
}

}  // namespace core
