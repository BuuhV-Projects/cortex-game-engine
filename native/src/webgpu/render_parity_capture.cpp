// Ver render_parity_capture.h (SPEC-0240, passo 1).
#include "render_parity_capture.h"

#include <SDL3/SDL.h>
#include <webgpu/wgpu.h>

#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <string>
#include <vector>

#include "../core/host_gpu.h"

namespace webgpu {
namespace {

// Alinhamento de linha exigido por copyTextureToBuffer — mesma regra do molde
// em override_probe.cpp (linhas 144-224).
constexpr uint32_t kBytesPerRowAlign = 256;
// Toda textura de swapchain usada aqui é de 8 bits × 4 canais (BGRA8Unorm ou
// RGBA8Unorm, dependendo do formato preferido da surface) — 4 bytes/pixel.
constexpr uint32_t kBytesPerPixel = 4;
// Teto padrão de quadros capturados por execução, se
// CORTEX_RENDER_PARITY_CAPTURE_FRAMES não vier — protege contra encher o
// disco numa sessão longa (o modo roda com a janela oculta, sem fim natural).
constexpr int kDefaultMaxFrames = 60;
// Aquecimento: quadros apresentados que são DESCARTADOS antes de a gravação
// começar (CORTEX_RENDER_PARITY_CAPTURE_SKIP sobrescreve). Sem ele o harness
// grava a tela de carregamento do jogo em vez da cena, e duas execuções
// "batem" com diferença zero sem nunca ter olhado para a pista — medido em
// 22/09/2026, ver SPEC-0240 §"Aquecimento obrigatório".
//
// O valor não precisa acertar o fim do carregamento: com a cena congelada
// (`?bench&hold`) qualquer N acima dele serve. 600 quadros ≈ 10 s a 60 Hz,
// folga larga sobre os ~4 s de carregamento medidos no kart-racer.
constexpr int kDefaultSkipFrames = 600;

struct CaptureState {
  bool enabled = false;
  std::string dir;
  int maxFrames = kDefaultMaxFrames;
  int skipFrames = kDefaultSkipFrames;
  int framesSkipped = 0;
  int framesCaptured = 0;
};

CaptureState& state() {
  static CaptureState s;
  return s;
}

uint32_t alignedBytesPerRow(uint32_t widthPixels) {
  const uint32_t unaligned = widthPixels * kBytesPerPixel;
  return ((unaligned + kBytesPerRowAlign - 1) / kBytesPerRowAlign) * kBytesPerRowAlign;
}

struct MapResult {
  bool done = false;
  WGPUMapAsyncStatus status = WGPUMapAsyncStatus_Error;
};

// Bombeia device/instância até o map assíncrono terminar — síncrono de
// propósito (harness), mesmo padrão do override_probe.cpp.
void pumpUntilMapped(WGPUDevice device, WGPUInstance instance, MapResult& result) {
  while (!result.done) {
    wgpuDevicePoll(device, false, nullptr);
    if (instance) wgpuInstanceProcessEvents(instance);
  }
}

// Grava `pixels` (com o padding de alinhamento entre linhas) num arquivo RGBA
// cru, descartando o padding: só os `width*4` bytes úteis de cada linha.
bool writeRawRgba(const std::string& path, const uint8_t* pixels, uint32_t width,
                   uint32_t height, uint32_t bytesPerRow) {
  FILE* f = std::fopen(path.c_str(), "wb");
  if (!f) return false;
  const uint32_t usefulBytes = width * kBytesPerPixel;
  for (uint32_t y = 0; y < height; ++y) {
    const uint8_t* row = pixels + static_cast<size_t>(y) * bytesPerRow;
    if (std::fwrite(row, 1, usefulBytes, f) != usefulBytes) {
      std::fclose(f);
      return false;
    }
  }
  std::fclose(f);
  return true;
}

}  // namespace

void initRenderParityCapture() {
  CaptureState& s = state();
  const char* dir = std::getenv("CORTEX_RENDER_PARITY_CAPTURE");
  if (!dir || !dir[0]) return;
  s.enabled = true;
  s.dir = dir;
  if (const char* framesEnv = std::getenv("CORTEX_RENDER_PARITY_CAPTURE_FRAMES")) {
    const int n = std::atoi(framesEnv);
    if (n > 0) s.maxFrames = n;
  }
  if (const char* skipEnv = std::getenv("CORTEX_RENDER_PARITY_CAPTURE_SKIP")) {
    const int n = std::atoi(skipEnv);
    if (n >= 0) s.skipFrames = n;
  }
  std::fprintf(stderr, "[render-parity] captura ligada: dir='%s' frames=%d aquecimento=%d\n",
               s.dir.c_str(), s.maxFrames, s.skipFrames);
  std::error_code ec;
  std::filesystem::create_directories(s.dir, ec);
  if (ec) {
    std::fprintf(stderr, "[render-parity] falha ao criar diretorio '%s': %s\n", s.dir.c_str(),
                 ec.message().c_str());
  }
}

bool renderParityCaptureEnabled() { return state().enabled; }

void maybeCaptureFrame(HostGpu* gpu, WGPUTexture texture) {
  CaptureState& s = state();
  if (!s.enabled || s.framesCaptured >= s.maxFrames) return;
  if (!gpu || !gpu->device || !gpu->queue || !texture) return;

  // Aquecimento: descarta os primeiros quadros (carregamento do jogo) antes de
  // gravar qualquer coisa — ver kDefaultSkipFrames.
  if (s.framesSkipped < s.skipFrames) {
    ++s.framesSkipped;
    if (s.framesSkipped == s.skipFrames) {
      std::fprintf(stderr, "[render-parity] aquecimento concluido (%d quadros) — gravando\n",
                   s.framesSkipped);
    }
    return;
  }

  const uint32_t width = wgpuTextureGetWidth(texture);
  const uint32_t height = wgpuTextureGetHeight(texture);
  if (width == 0 || height == 0) return;

  const uint32_t bytesPerRow = alignedBytesPerRow(width);
  const uint64_t bufferSize = static_cast<uint64_t>(bytesPerRow) * height;

  WGPUBufferDescriptor readbackDesc = WGPU_BUFFER_DESCRIPTOR_INIT;
  readbackDesc.usage = WGPUBufferUsage_CopyDst | WGPUBufferUsage_MapRead;
  readbackDesc.size = bufferSize;
  WGPUBuffer readback = wgpuDeviceCreateBuffer(gpu->device, &readbackDesc);
  if (!readback) {
    std::fprintf(stderr, "[render-parity] falha ao criar buffer de readback\n");
    return;
  }

  WGPUCommandEncoderDescriptor encDesc = WGPU_COMMAND_ENCODER_DESCRIPTOR_INIT;
  WGPUCommandEncoder encoder = wgpuDeviceCreateCommandEncoder(gpu->device, &encDesc);

  WGPUTexelCopyTextureInfo src = WGPU_TEXEL_COPY_TEXTURE_INFO_INIT;
  src.texture = texture;
  WGPUTexelCopyBufferInfo dst = WGPU_TEXEL_COPY_BUFFER_INFO_INIT;
  dst.buffer = readback;
  dst.layout.bytesPerRow = bytesPerRow;
  dst.layout.rowsPerImage = height;
  WGPUExtent3D extent = {width, height, 1};
  wgpuCommandEncoderCopyTextureToBuffer(encoder, &src, &dst, &extent);

  WGPUCommandBufferDescriptor cbDesc = WGPU_COMMAND_BUFFER_DESCRIPTOR_INIT;
  WGPUCommandBuffer commands = wgpuCommandEncoderFinish(encoder, &cbDesc);
  wgpuQueueSubmit(gpu->queue, 1, &commands);
  wgpuCommandBufferRelease(commands);
  wgpuCommandEncoderRelease(encoder);

  MapResult mapResult;
  WGPUBufferMapCallbackInfo mapCb = WGPU_BUFFER_MAP_CALLBACK_INFO_INIT;
  mapCb.mode = WGPUCallbackMode_AllowProcessEvents;
  mapCb.userdata1 = &mapResult;
  mapCb.callback = [](WGPUMapAsyncStatus status, WGPUStringView, void* ud1, void*) {
    auto* r = static_cast<MapResult*>(ud1);
    r->status = status;
    r->done = true;
  };
  wgpuBufferMapAsync(readback, WGPUMapMode_Read, 0, bufferSize, mapCb);
  pumpUntilMapped(gpu->device, gpu->instance, mapResult);

  if (mapResult.status == WGPUMapAsyncStatus_Success) {
    const auto* pixels =
        static_cast<const uint8_t*>(wgpuBufferGetConstMappedRange(readback, 0, bufferSize));
    if (pixels) {
      // Dimensões no próprio nome do arquivo: RGBA cru não carrega header, e o
      // comparador (render-parity.mjs) precisa saber width/height sem
      // depender de um argumento à parte.
      char filename[96];
      std::snprintf(filename, sizeof(filename), "frame_%04d_%ux%u.rgba", s.framesCaptured, width,
                   height);
      const std::string path = (std::filesystem::path(s.dir) / filename).string();
      if (writeRawRgba(path, pixels, width, height, bytesPerRow)) {
        std::fprintf(stderr, "[render-parity] frame=%d width=%u height=%u path=%s\n",
                     s.framesCaptured, width, height, path.c_str());
        ++s.framesCaptured;
      } else {
        std::fprintf(stderr, "[render-parity] falha ao gravar '%s'\n", path.c_str());
      }
    }
    wgpuBufferUnmap(readback);
  } else {
    std::fprintf(stderr, "[render-parity] falha ao mapear o readback (frame %d)\n",
                 s.framesCaptured);
  }

  wgpuBufferRelease(readback);

  // Terminou a rodada: encerra pelo caminho normal (pollEvents ->
  // core::handleEvent -> running = false), em vez de depender de alguém matar
  // o processo por tempo — matar arrisca truncar o último arquivo e torna a
  // rodada não roteirizável (SPEC-0240 §"Saída automática ao terminar").
  if (s.framesCaptured >= s.maxFrames) {
    std::fprintf(stderr, "[render-parity] %d quadro(s) gravados — encerrando\n", s.framesCaptured);
    SDL_Event quit{};
    quit.type = SDL_EVENT_QUIT;
    SDL_PushEvent(&quit);
  }
}

}  // namespace webgpu
