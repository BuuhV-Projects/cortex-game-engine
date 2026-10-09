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

/** Cada timestamp é um uint64 de nanossegundos. */
constexpr uint64_t kBytesPorTimestamp = sizeof(uint64_t);
/** Bytes do query set inteiro (teto de passes × 2 timestamps). */
constexpr uint64_t kBytesDoQuerySet = static_cast<uint64_t>(kMaxPassesPorFrame) * kSlotsPorPass * kBytesPorTimestamp;
/** Quantos passes aparecem no relatório, do mais caro para o menos. */
constexpr size_t kPassesNoRelatorio = 6;
constexpr double kNsPorMs = 1'000'000.0;
/** Percentis da linha `gpu-work`. */
constexpr double kMediana = 0.5;
constexpr double kPercentilAlto = 0.95;
constexpr double kMaximo = 1.0;
/** Tamanho das linhas do relatório. */
constexpr size_t kTamanhoDaLinha = 512;

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
/** Origem de cada pass do frame corrente. */
std::array<PassOrigin, kMaxPassesPorFrame> g_origemDoFrame{};

/**
 * O que a leitura em voo carrega: quantos passes o quadro copiado usou e a
 * origem de cada um. Copiado NO MOMENTO da cópia — o quadro seguinte já
 * reescreve `g_origemDoFrame` antes do mapeamento voltar.
 */
uint32_t g_usadosNaCopia = 0;
std::array<PassOrigin, kMaxPassesPorFrame> g_origemNaCopia{};

PassTimingStats g_stats;
size_t g_passesSemSlotTotal = 0;

uint64_t bytesDosSlots(uint32_t passes) {
  return static_cast<uint64_t>(passes) * kSlotsPorPass * kBytesPorTimestamp;
}

void aoMapear(WGPUMapAsyncStatus status, WGPUStringView, void*, void*) {
  g_leituraEmVoo = false;
  // Falha de mapeamento sai SEM unmap de proposito: o buffer nao chegou a ser
  // mapeado, e chamar unmap ali e erro de uso.
  if (status != WGPUMapAsyncStatus_Success || g_readBuffer == nullptr) return;
  const auto* dados =
      static_cast<const uint64_t*>(wgpuBufferGetConstMappedRange(g_readBuffer, 0, bytesDosSlots(g_usadosNaCopia)));
  if (dados != nullptr) g_stats.addFrame(dados, g_usadosNaCopia, g_origemNaCopia.data());
  wgpuBufferUnmap(g_readBuffer);
}

double percentil(const std::vector<uint64_t>& ordenado, double p) {
  if (ordenado.empty()) return 0.0;
  const size_t i = static_cast<size_t>(p * static_cast<double>(ordenado.size() - 1));
  return static_cast<double>(ordenado[i]) / kNsPorMs;
}

/**
 * Linha `gpu-work`: tempo de GPU por quadro (soma dos passes, relógio da GPU)
 * e ms/quadro por origem. Substitui o `gpu-latency` (SPEC-0334), que media
 * quando o host NOTAVA a conclusão, não quando a GPU terminava.
 */
void relatarGpuWork() {
  std::vector<uint64_t> totais = g_stats.totalPorQuadro;
  std::sort(totais.begin(), totais.end());
  const double quadros = static_cast<double>(g_stats.quadros());
  char buf[kTamanhoDaLinha];
  int n = std::snprintf(buf, sizeof(buf), "gpu-work (%zu quadros) med=%.3f p95=%.3f max=%.3f passes/q=%.1f |",
                        g_stats.quadros(), percentil(totais, kMediana), percentil(totais, kPercentilAlto),
                        percentil(totais, kMaximo), static_cast<double>(g_stats.passesUsados) / quadros);
  for (PassOrigin origem : kOrigensDoRelatorio) {
    if (n < 0 || static_cast<size_t>(n) >= sizeof(buf)) break;
    const double msPorQuadro = static_cast<double>(g_stats.nsPorOrigem[indiceDaOrigem(origem)]) / kNsPorMs / quadros;
    const int k = std::snprintf(buf + n, sizeof(buf) - static_cast<size_t>(n), " %c=%.3f",
                                static_cast<char>(origem), msPorQuadro);
    if (k > 0) n += k;
  }
  core::appendPerfLog("%s", buf);
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
  WGPUBufferDescriptor bd = WGPU_BUFFER_DESCRIPTOR_INIT;
  bd.size = kBytesDoQuerySet;
  bd.usage = WGPUBufferUsage_QueryResolve | WGPUBufferUsage_CopySrc;
  g_resolveBuffer = wgpuDeviceCreateBuffer(device, &bd);
  WGPUBufferDescriptor rd = WGPU_BUFFER_DESCRIPTOR_INIT;
  rd.size = kBytesDoQuerySet;
  rd.usage = WGPUBufferUsage_CopyDst | WGPUBufferUsage_MapRead;
  g_readBuffer = wgpuDeviceCreateBuffer(device, &rd);
}

const WGPUPassTimestampWrites* nextPassTimestampWrites(PassOrigin origem) {
  if (!g_enabled || g_querySet == nullptr) return nullptr;
  if (g_passeDoFrame >= kMaxPassesPorFrame) {
    g_passesSemSlot++;
    return nullptr;
  }
  const uint32_t p = g_passeDoFrame++;
  g_origemDoFrame[p] = origem;
  auto& w = g_writes[p];
  w = WGPU_PASS_TIMESTAMP_WRITES_INIT;
  w.querySet = g_querySet;
  w.beginningOfPassWriteIndex = p * kSlotsPorPass;
  w.endOfPassWriteIndex = p * kSlotsPorPass + 1;
  return &w;
}

void resolvePassTiming(WGPUCommandEncoderImpl* encoder, WGPUQueueImpl* queue) {
  (void)queue;
  if (!g_enabled || g_querySet == nullptr || encoder == nullptr) return;
  const uint32_t usados = g_passeDoFrame;
  g_passesSemSlotTotal += g_passesSemSlot;
  g_passeDoFrame = 0;
  g_passesSemSlot = 0;
  // Uma leitura por vez: se a anterior ainda não voltou, este frame não é
  // amostrado. Enfileirar mapeamentos concorrentes no mesmo buffer é erro de
  // uso, e esperar mediria o instrumento em vez do jogo.
  if (usados == 0 || g_leituraEmVoo) return;
  // SÓ os slots que este quadro escreveu (SPEC-0334): os demais guardam
  // timestamps de quadros antigos e inventavam passes no relatório.
  wgpuCommandEncoderResolveQuerySet(encoder, g_querySet, 0, usados * kSlotsPorPass, g_resolveBuffer, 0);
  wgpuCommandEncoderCopyBufferToBuffer(encoder, g_resolveBuffer, 0, g_readBuffer, 0, bytesDosSlots(usados));
  g_usadosNaCopia = usados;
  g_origemNaCopia = g_origemDoFrame;
  // O `mapAsync` NÃO vai aqui. A cópia acima só foi GRAVADA no encoder; ela
  // executa no submit, e mapear antes disso faz o wgpu abortar o processo com
  // "Buffer is still mapped" — aconteceu, e derrubou o jogo no boot.
  g_copiaGravada = true;
}

void startPassTimingRead() {
  if (!g_enabled || !g_copiaGravada || g_leituraEmVoo) return;
  g_copiaGravada = false;
  g_leituraEmVoo = true;
  WGPUBufferMapCallbackInfo cb = WGPU_BUFFER_MAP_CALLBACK_INFO_INIT;
  cb.mode = WGPUCallbackMode_AllowProcessEvents;
  cb.callback = aoMapear;
  wgpuBufferMapAsync(g_readBuffer, WGPUMapMode_Read, 0, bytesDosSlots(g_usadosNaCopia), cb);
}

void pumpPassTiming(WGPUInstanceImpl* instance) {
  if (!g_enabled || instance == nullptr) return;
  wgpuInstanceProcessEvents(instance);
}

bool reportPassTiming() {
  if (!g_enabled || g_stats.quadros() == 0) return false;
  struct Linha {
    uint32_t passe;
    double mediaMs;
    double maxMs;
  };
  std::vector<Linha> linhas;
  for (uint32_t p = 0; p < kMaxPassesPorFrame; ++p) {
    const auto& a = g_stats.porPosicao[p];
    if (a.amostras == 0) continue;
    linhas.push_back({p, static_cast<double>(a.somaNs) / a.amostras / kNsPorMs,
                      static_cast<double>(a.maxNs) / kNsPorMs});
  }
  // Do mais caro para o menos: o relatório serve para achar o alvo.
  std::sort(linhas.begin(), linhas.end(), [](const Linha& a, const Linha& b) { return a.mediaMs > b.mediaMs; });
  double total = 0;
  for (const auto& l : linhas) total += l.mediaMs;

  const double quadros = static_cast<double>(g_stats.quadros());
  char buf[kTamanhoDaLinha];
  int n = std::snprintf(buf, sizeof(buf), "pass-timing (%zu frames lidos, %.1f passes/frame, soma=%.2fms)",
                        g_stats.quadros(), static_cast<double>(g_stats.passesUsados) / quadros, total);
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
  relatarGpuWork();
  g_stats.clear();
  g_passesSemSlotTotal = 0;
  return true;
}

}  // namespace webgpu
