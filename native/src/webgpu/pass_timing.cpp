#include "pass_timing.h"

#include <SDL3/SDL.h>
#include <webgpu/webgpu.h>

#include <algorithm>
#include <array>
#include <cstdio>
#include <vector>

#include "../core/crash_handler.h"

namespace webgpu {
namespace {

/**
 * Passes medidos por frame.
 *
 * O kart-racer roda dezenas por frame (o CSM faz um por cascata). Passes acima
 * deste teto ficam sem medida, e o relatório diz quantos — número silencioso
 * seria pior que número nenhum.
 */
constexpr uint32_t kMaxPassesPorFrame = 64;
/** Dois timestamps por pass: início e fim. */
constexpr uint32_t kSlotsPorPass = 2;
/** Frames acumulados antes de cada relatório — o ritmo das outras medições. */
constexpr size_t kFramesPorRelatorio = 300;
/** Cada timestamp é um uint64 de nanossegundos. */
constexpr uint64_t kBytesPorTimestamp = sizeof(uint64_t);
/** Quantos passes aparecem no relatório, do mais caro para o menos. */
constexpr size_t kPassesNoRelatorio = 6;
constexpr double kNsPorMs = 1'000'000.0;

bool g_enabled = false;
WGPUQuerySet g_querySet = nullptr;
WGPUBuffer g_resolveBuffer = nullptr;  ///< destino do resolveQuerySet (GPU)
WGPUBuffer g_readBuffer = nullptr;     ///< cópia mapeável para a CPU
WGPUDevice g_device = nullptr;
bool g_leituraEmVoo = false;
/** A copia para o buffer de leitura ja foi gravada no encoder deste frame. */
bool g_copiaGravada = false;

/** Índice do próximo slot livre no frame corrente. */
uint32_t g_passeDoFrame = 0;
/** Passes que não couberam no teto, no frame corrente. */
uint32_t g_passesSemSlot = 0;
/** `timestampWrites` vivos até o fim do frame (o descriptor os referencia). */
std::array<WGPUPassTimestampWrites, kMaxPassesPorFrame> g_writes{};

/** Estatística acumulada de um pass, por posição no frame. */
struct AcumuladoDoPasse {
  uint64_t somaNs = 0;
  uint64_t maxNs = 0;
  uint32_t amostras = 0;
};
std::array<AcumuladoDoPasse, kMaxPassesPorFrame> g_acumulado{};
size_t g_framesLidos = 0;
size_t g_passesSemSlotTotal = 0;

void aoMapear(WGPUMapAsyncStatus status, WGPUStringView, void*, void*) {
  g_leituraEmVoo = false;
  // Falha de mapeamento sai SEM unmap de proposito: o buffer nao chegou a ser
  // mapeado, e chamar unmap ali e erro de uso.
  if (status != WGPUMapAsyncStatus_Success || g_readBuffer == nullptr) return;
  const auto* dados = static_cast<const uint64_t*>(
      wgpuBufferGetConstMappedRange(g_readBuffer, 0, kMaxPassesPorFrame * kSlotsPorPass * kBytesPorTimestamp));
  if (dados != nullptr) {
    for (uint32_t p = 0; p < kMaxPassesPorFrame; ++p) {
      const uint64_t inicio = dados[p * kSlotsPorPass];
      const uint64_t fim = dados[p * kSlotsPorPass + 1];
      // Par zerado é slot não usado neste frame; fim < início é timestamp
      // inválido (o wgpu permite, em recuperação de device).
      if (inicio == 0 || fim <= inicio) continue;
      auto& acc = g_acumulado[p];
      const uint64_t dur = fim - inicio;
      acc.somaNs += dur;
      acc.maxNs = std::max(acc.maxNs, dur);
      acc.amostras++;
    }
    g_framesLidos++;
  }
  wgpuBufferUnmap(g_readBuffer);
}

}  // namespace

void initPassTiming() { g_enabled = SDL_getenv("CORTEX_FRAME_TIMING") != nullptr; }

bool passTimingEnabled() { return g_enabled; }

bool adapterSupportsTimestamp(WGPUAdapterImpl* adapter) {
  if (!g_enabled || adapter == nullptr) return false;
  return wgpuAdapterHasFeature(adapter, WGPUFeatureName_TimestampQuery) != 0;
}

void setupPassTiming(WGPUDeviceImpl* device) {
  if (!g_enabled || device == nullptr) return;
  g_device = device;
  WGPUQuerySetDescriptor qsd = WGPU_QUERY_SET_DESCRIPTOR_INIT;
  qsd.type = WGPUQueryType_Timestamp;
  qsd.count = kMaxPassesPorFrame * kSlotsPorPass;
  g_querySet = wgpuDeviceCreateQuerySet(device, &qsd);
  if (g_querySet == nullptr) {
    // Sem query set não há o que medir. Desliga em vez de seguir produzindo
    // zeros, que seriam lidos como "os passes não custam nada".
    core::appendPerfLog("pass-timing: createQuerySet falhou — medicao por pass DESLIGADA");
    g_enabled = false;
    return;
  }
  const uint64_t bytes = static_cast<uint64_t>(qsd.count) * kBytesPorTimestamp;
  WGPUBufferDescriptor bd = WGPU_BUFFER_DESCRIPTOR_INIT;
  bd.size = bytes;
  bd.usage = WGPUBufferUsage_QueryResolve | WGPUBufferUsage_CopySrc;
  g_resolveBuffer = wgpuDeviceCreateBuffer(device, &bd);
  WGPUBufferDescriptor rd = WGPU_BUFFER_DESCRIPTOR_INIT;
  rd.size = bytes;
  rd.usage = WGPUBufferUsage_CopyDst | WGPUBufferUsage_MapRead;
  g_readBuffer = wgpuDeviceCreateBuffer(device, &rd);
}

const WGPUPassTimestampWrites* nextPassTimestampWrites() {
  if (!g_enabled || g_querySet == nullptr) return nullptr;
  if (g_passeDoFrame >= kMaxPassesPorFrame) {
    g_passesSemSlot++;
    return nullptr;
  }
  const uint32_t p = g_passeDoFrame++;
  auto& w = g_writes[p];
  w = WGPU_PASS_TIMESTAMP_WRITES_INIT;
  w.querySet = g_querySet;
  w.beginningOfPassWriteIndex = p * kSlotsPorPass;
  w.endOfPassWriteIndex = p * kSlotsPorPass + 1;
  return &w;
}

void resolvePassTiming(WGPUCommandEncoderImpl* encoder, WGPUQueueImpl* queue) {
  if (!g_enabled || g_querySet == nullptr || encoder == nullptr) return;
  const uint32_t usados = g_passeDoFrame;
  g_passesSemSlotTotal += g_passesSemSlot;
  g_passeDoFrame = 0;
  g_passesSemSlot = 0;
  if (usados == 0) return;
  const uint64_t bytes = static_cast<uint64_t>(kMaxPassesPorFrame) * kSlotsPorPass * kBytesPorTimestamp;
  wgpuCommandEncoderResolveQuerySet(encoder, g_querySet, 0, kMaxPassesPorFrame * kSlotsPorPass,
                                    g_resolveBuffer, 0);
  // Uma leitura por vez: se a anterior ainda não voltou, este frame não é
  // amostrado. Enfileirar mapeamentos concorrentes no mesmo buffer é erro de
  // uso, e esperar mediria o instrumento em vez do jogo.
  if (g_leituraEmVoo) return;
  wgpuCommandEncoderCopyBufferToBuffer(encoder, g_resolveBuffer, 0, g_readBuffer, 0, bytes);
  (void)queue;
  // O `mapAsync` NÃO vai aqui. A cópia acima só foi GRAVADA no encoder; ela
  // executa no submit, e mapear antes disso faz o wgpu abortar o processo com
  // "Buffer is still mapped" — aconteceu, e derrubou o jogo no boot.
  g_copiaGravada = true;
}

void startPassTimingRead() {
  if (!g_enabled || !g_copiaGravada || g_leituraEmVoo) return;
  g_copiaGravada = false;
  g_leituraEmVoo = true;
  const uint64_t bytes = static_cast<uint64_t>(kMaxPassesPorFrame) * kSlotsPorPass * kBytesPorTimestamp;
  WGPUBufferMapCallbackInfo cb = WGPU_BUFFER_MAP_CALLBACK_INFO_INIT;
  cb.mode = WGPUCallbackMode_AllowProcessEvents;
  cb.callback = aoMapear;
  wgpuBufferMapAsync(g_readBuffer, WGPUMapMode_Read, 0, bytes, cb);
}

void pumpPassTiming(WGPUInstanceImpl* instance) {
  if (!g_enabled || instance == nullptr) return;
  wgpuInstanceProcessEvents(instance);
}

bool reportPassTiming() {
  if (!g_enabled || g_framesLidos == 0) return false;
  struct Linha {
    uint32_t passe;
    double mediaMs;
    double maxMs;
  };
  std::vector<Linha> linhas;
  for (uint32_t p = 0; p < kMaxPassesPorFrame; ++p) {
    const auto& a = g_acumulado[p];
    if (a.amostras == 0) continue;
    linhas.push_back({p, static_cast<double>(a.somaNs) / a.amostras / kNsPorMs,
                      static_cast<double>(a.maxNs) / kNsPorMs});
  }
  if (linhas.empty()) return false;
  // Do mais caro para o menos: o relatório serve para achar o alvo.
  std::sort(linhas.begin(), linhas.end(), [](const Linha& a, const Linha& b) { return a.mediaMs > b.mediaMs; });
  double total = 0;
  for (const auto& l : linhas) total += l.mediaMs;

  char buf[512];
  int n = std::snprintf(buf, sizeof(buf), "pass-timing (%zu frames lidos, %zu passes/frame, soma=%.2fms)",
                        g_framesLidos, linhas.size(), total);
  for (size_t i = 0; i < linhas.size() && i < kPassesNoRelatorio; ++i) {
    const auto& l = linhas[i];
    const int k = std::snprintf(buf + n, sizeof(buf) - static_cast<size_t>(n),
                                " | #%u med=%.2f max=%.2f", l.passe, l.mediaMs, l.maxMs);
    if (k > 0) n += k;
  }
  if (g_passesSemSlotTotal > 0) {
    std::snprintf(buf + n, sizeof(buf) - static_cast<size_t>(n), " | SEM SLOT: %zu", g_passesSemSlotTotal);
  }
  core::appendPerfLog("%s", buf);
  g_acumulado.fill({});
  g_framesLidos = 0;
  g_passesSemSlotTotal = 0;
  return true;
}

}  // namespace webgpu
