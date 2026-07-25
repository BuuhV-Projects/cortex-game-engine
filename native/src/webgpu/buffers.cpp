// buffers — recursos de DADOS da GPU: GPUBuffer (createBuffer/writeBuffer)
// e bind groups (createBindGroup). Também registra o global GPUBufferUsage
// (constantes numéricas idênticas às da spec WebGPU/webgpu.h).

#include <atomic>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <map>
#include <string>
#include <unordered_map>
#include <vector>

#include "../core/crash_handler.h"
#include "../napi/napi_util.h"
#include "../shims/perf_stats.h"
#include "internal.h"
#include "napi_stats.h"

namespace webgpu {
namespace {

void finalizeBuffer(napi_env, void* data, void*) {
  if (data) {
    wgpuBufferRelease(static_cast<WGPUBuffer>(data));
    countFinalizedBuffer();
  }
}

void finalizeBindGroup(napi_env, void* data, void*) {
  if (data) wgpuBindGroupRelease(static_cast<WGPUBindGroup>(data));
}

}  // namespace

// destroy() do JS = DESTRUIÇÃO ADIADA (ADR-0153, 2ª rodada). Histórico:
// destruir NA HORA derrubava o jogo (o three ainda gravava passes com buffers
// "destruídos" frames depois do dispose; validação de submit no wgpu-native é
// PANIC fatal), então virou release-only — mas aí a VRAM NUNCA voltava: mesmo
// com o GC rodando os finalizers (Release), refs internas do wgpu (views/bind
// groups vivos etc.) seguravam o recurso, e medimos ~770 MB de VRAM vazando
// POR TROCA de fase no soak. A solução é o meio-termo que estes hooks sempre
// previram: enfileirar o destroy e executá-lo N frames depois — fora da janela
// de qualquer pass já gravado/em voo, mas determinístico (não depende do GC).
namespace {

// Nº de frames entre o destroy() do JS e o wgpu*Destroy real. Cobre a janela
// de passes gravados no frame corrente + frames-in-flight do driver, com
// margem (o panic histórico era "vários frames depois", intermitente).
constexpr int kDeferredDestroyFrames = 10;

int g_frameCounter = 0;

struct DeferredBuffer {
  int frame;
  WGPUBuffer buffer;
};
struct DeferredTexture {
  int frame;
  WGPUTexture texture;
};
std::vector<DeferredBuffer> g_deferredBuffers;
std::vector<DeferredTexture> g_deferredTextures;

// Telemetria temporária (ver internal.h): criação × destroy × finalizer.
std::atomic<int> g_finalizedBuffers{0};
std::atomic<int> g_finalizedTextures{0};
std::atomic<int> g_createdBuffers{0};
std::atomic<int> g_createdTextures{0};
std::atomic<int> g_destroyedBuffers{0};
std::atomic<int> g_destroyedTextures{0};
std::atomic<uint64_t> g_createdBufferBytes{0};

}  // namespace

// A fila segura uma REF PRÓPRIA (AddRef) até o destroy rodar: entre o
// destroy() do JS e o flush, o GC pode coletar o wrapper e o finalizer dá
// Release — sem a ref extra, o refcount zera e o Destroy adiado vira
// use-after-free (AV dentro do wgpu, visto no soak).
void deferDestroyBuffer(WGPUBuffer buffer) {
  if (!buffer) return;
  wgpuBufferAddRef(buffer);
  g_deferredBuffers.push_back({g_frameCounter, buffer});
  ++g_destroyedBuffers;
}

void deferDestroyTexture(WGPUTexture texture) {
  if (!texture) return;
  wgpuTextureAddRef(texture);
  g_deferredTextures.push_back({g_frameCounter, texture});
  ++g_destroyedTextures;
  trackTextureDestroyed(texture);
}

void countFinalizedBuffer() { ++g_finalizedBuffers; }
void countFinalizedTexture() { ++g_finalizedTextures; }
void countCreatedBuffer(uint64_t bytes) {
  ++g_createdBuffers;
  g_createdBufferBytes += bytes;
}
void countCreatedTexture() { ++g_createdTextures; }

// Registro de texturas vivas (telemetria temporária, ver internal.h).
namespace {
struct AliveTexInfo {
  uint32_t width, height, depth, mips, samples;
  std::string format;
};
std::unordered_map<WGPUTexture, AliveTexInfo> g_aliveTextures;
}  // namespace

void trackTextureCreated(WGPUTexture texture, uint32_t width, uint32_t height,
                         uint32_t depth, uint32_t mips, uint32_t sampleCount,
                         const char* format) {
  if (texture) g_aliveTextures[texture] = {width, height, depth, mips, sampleCount, format ? format : "?"};
}

void trackTextureDestroyed(WGPUTexture texture) { g_aliveTextures.erase(texture); }

void dumpAliveTextures() {
  // Agrupa por (dims/formato) pra leitura compacta; vai pro perf-log.txt da
  // pasta do jogo (e pro console com CORTEX_VRAM_LOG=1).
  static const bool console = std::getenv("CORTEX_VRAM_LOG") != nullptr;
  std::map<std::string, int> grouped;
  for (const auto& [tex, info] : g_aliveTextures) {
    char key[128];
    std::snprintf(key, sizeof(key), "%ux%ux%u mips=%u s=%u %s", info.width,
                  info.height, info.depth, info.mips, info.samples,
                  info.format.c_str());
    grouped[key]++;
  }
  core::appendPerfLog("texturas VIVAS (%zu):", g_aliveTextures.size());
  if (console) std::printf("[gc] texturas VIVAS (%zu):\n", g_aliveTextures.size());
  for (const auto& [key, count] : grouped) {
    core::appendPerfLog("  %3dx  %s", count, key.c_str());
    if (console) std::printf("[gc]   %3dx  %s\n", count, key.c_str());
  }
  if (console) std::fflush(stdout);
}

void flushDeferredDestroys() {
  ++g_frameCounter;
  const int cutoff = g_frameCounter - kDeferredDestroyFrames;
  size_t db = 0;
  while (db < g_deferredBuffers.size() && g_deferredBuffers[db].frame <= cutoff) {
    wgpuBufferDestroy(g_deferredBuffers[db].buffer);
    wgpuBufferRelease(g_deferredBuffers[db].buffer);  // solta a ref da fila
    ++db;
  }
  if (db) g_deferredBuffers.erase(g_deferredBuffers.begin(), g_deferredBuffers.begin() + db);
  size_t dt = 0;
  while (dt < g_deferredTextures.size() && g_deferredTextures[dt].frame <= cutoff) {
    wgpuTextureDestroy(g_deferredTextures[dt].texture);
    wgpuTextureRelease(g_deferredTextures[dt].texture);  // solta a ref da fila
    ++dt;
  }
  if (dt) g_deferredTextures.erase(g_deferredTextures.begin(), g_deferredTextures.begin() + dt);

  // Telemetria de VRAM (ADR-0153): quando os totais mudam (~2s), grava um
  // resumo no `perf-log.txt` da pasta do jogo — RAM/VRAM do processo (DXGI) +
  // criação×destroy×release + texturas vivas com dimensões. É o arquivo que
  // aponta ONDE está o vazamento sem precisar de console; `CORTEX_VRAM_LOG=1`
  // espelha no stdout.
  static const bool console = std::getenv("CORTEX_VRAM_LOG") != nullptr;
  static int lastB = 0;
  static int lastT = 0;
  if (g_frameCounter % 120 != 0) return;
  const int b = g_finalizedBuffers.load();
  const int t = g_finalizedTextures.load();
  if (b != lastB || t != lastT) {
    core::appendPerfLog(
        "vram=%.0fMB ws=%.0fMB | buffers criados=%d (%.0f MB) destroy=%d release=%d | texturas criadas=%d destroy=%d release=%d",
        shims::perfGpuMemMB(), shims::perfWorkingSetMB(),
        g_createdBuffers.load(), g_createdBufferBytes.load() / 1048576.0,
        g_destroyedBuffers.load(), b, g_createdTextures.load(),
        g_destroyedTextures.load(), t);
    if (console) {
      std::printf(
          "[gc] buffers criados=%d (%.0f MB) destroy=%d release=%d | texturas criadas=%d destroy=%d release=%d\n",
          g_createdBuffers.load(), g_createdBufferBytes.load() / 1048576.0,
          g_destroyedBuffers.load(), b, g_createdTextures.load(),
          g_destroyedTextures.load(), t);
      std::fflush(stdout);
    }
    dumpAliveTextures();
    lastB = b;
    lastT = t;
  }
}

// Extrai (ponteiro, bytes totais, bytes/elemento) de um TypedArray ou
// ArrayBuffer JS. elementSize=1 pra ArrayBuffer (offsets em bytes).
// Compartilhado com textures.cpp (declarado no internal.h).
bool getJsBytes(napi_env env, napi_value value, void** data, size_t* size,
                size_t* elementSize) {
  bool isTypedArray = false;
  napi_is_typedarray(env, value, &isTypedArray);
  if (isTypedArray) {
    napi_typedarray_type type;
    size_t length = 0;
    napi_value arrayBuffer = nullptr;
    size_t byteOffset = 0;
    void* bufferData = nullptr;
    napi_get_typedarray_info(env, value, &type, &length, &bufferData,
                             &arrayBuffer, &byteOffset);
    // O Node-API devolve o ponteiro já deslocado pro início da view.
    switch (type) {
      case napi_int8_array:
      case napi_uint8_array:
      case napi_uint8_clamped_array: *elementSize = 1; break;
      case napi_int16_array:
      case napi_uint16_array: *elementSize = 2; break;
      case napi_int32_array:
      case napi_uint32_array:
      case napi_float32_array: *elementSize = 4; break;
      case napi_float64_array:
      case napi_bigint64_array:
      case napi_biguint64_array: *elementSize = 8; break;
      default: *elementSize = 1; break;
    }
    *data = bufferData;
    *size = length * *elementSize;
    return true;
  }
  bool isArrayBuffer = false;
  napi_is_arraybuffer(env, value, &isArrayBuffer);
  if (isArrayBuffer) {
    *elementSize = 1;
    return napi_get_arraybuffer_info(env, value, data, size) == napi_ok;
  }
  return false;
}

namespace {

napi_value bufferDestroy(napi_env env, napi_callback_info info) {
  size_t argc = 0;
  auto* buffer =
      static_cast<WGPUBuffer>(njs::unwrapThis(env, info, &argc, nullptr));
  // RELEASE-ONLY (ver internal.h): o finalizer libera quando o GC coletar.
  deferDestroyBuffer(buffer);
  return njs::undefined(env);
}

// getMappedRange([offset[, size]]) — ArrayBuffer externo sobre a memória
// mapeada pelo wgpu (válido até unmap(); o three escreve e desmapeia logo).
napi_value bufferGetMappedRange(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value args[2];
  auto* buffer =
      static_cast<WGPUBuffer>(njs::unwrapThis(env, info, &argc, args));
  if (!buffer) return njs::undefined(env);

  double offset = 0;
  if (argc >= 1) napi_get_value_double(env, args[0], &offset);
  double size = -1;
  if (argc >= 2) napi_get_value_double(env, args[1], &size);
  uint64_t rangeSize = size < 0
      ? (wgpuBufferGetSize(buffer) - static_cast<uint64_t>(offset))
      : static_cast<uint64_t>(size);

  void* data = wgpuBufferGetMappedRange(
      buffer, static_cast<uint64_t>(offset), rangeSize);
  if (!data) {
    njs::throwError(env, "getMappedRange: buffer não está mapeado");
    return njs::undefined(env);
  }
  napi_value arrayBuffer = nullptr;
  napi_create_external_arraybuffer(env, data, static_cast<size_t>(rangeSize),
                                   nullptr, nullptr, &arrayBuffer);
  return arrayBuffer;
}

napi_value bufferUnmap(napi_env env, napi_callback_info info) {
  size_t argc = 0;
  auto* buffer =
      static_cast<WGPUBuffer>(njs::unwrapThis(env, info, &argc, nullptr));
  if (buffer) wgpuBufferUnmap(buffer);
  return njs::undefined(env);
}

// mapAsync(mode[, offset[, size]]) → Promise. Readback real: bombeia
// ProcessEvents até o map completar (o three usa em getMappedRange depois).
napi_value bufferMapAsync(napi_env env, napi_callback_info info) {
  size_t argc = 3;
  napi_value args[3];
  auto* buffer =
      static_cast<WGPUBuffer>(njs::unwrapThis(env, info, &argc, args));
  HostGpu* gpu = gpuState();
  if (!buffer || !gpu) return njs::resolvedPromise(env, njs::undefined(env));

  double mode = 1, offset = 0;
  if (argc >= 1) napi_get_value_double(env, args[0], &mode);
  if (argc >= 2) napi_get_value_double(env, args[1], &offset);
  double size = argc >= 3 ? 0 : -1;
  if (argc >= 3) napi_get_value_double(env, args[2], &size);
  uint64_t mapSize = size < 0
      ? (wgpuBufferGetSize(buffer) - static_cast<uint64_t>(offset))
      : static_cast<uint64_t>(size);

  struct MapResult {
    bool done = false;
  } result;
  WGPUBufferMapCallbackInfo cb = WGPU_BUFFER_MAP_CALLBACK_INFO_INIT;
  cb.mode = WGPUCallbackMode_AllowProcessEvents;
  cb.userdata1 = &result;
  cb.callback = [](WGPUMapAsyncStatus, WGPUStringView, void* u1, void*) {
    static_cast<MapResult*>(u1)->done = true;
  };
  wgpuBufferMapAsync(buffer, static_cast<WGPUMapMode>(mode),
                     static_cast<uint64_t>(offset), mapSize, cb);
  while (!result.done) wgpuInstanceProcessEvents(gpu->instance);
  return njs::resolvedPromise(env, njs::undefined(env));
}

// resource de bind group: {buffer} | GPUTextureView | GPUSampler.
// Views e samplers carregam a marca `__kind` (definida ao criar o objeto)
// porque o napi_wrap não distingue o tipo do handle.
WGPUBindGroupEntry parseBindGroupEntry(napi_env env, napi_value entry) {
  WGPUBindGroupEntry out = WGPU_BIND_GROUP_ENTRY_INIT;
  out.binding =
      static_cast<uint32_t>(njs::getNamedNumber(env, entry, "binding", 0));

  napi_value resource = nullptr;
  if (!njs::getNamed(env, entry, "resource", &resource)) return out;

  napi_value bufferValue = nullptr;
  if (njs::getNamed(env, resource, "buffer", &bufferValue)) {
    out.buffer = static_cast<WGPUBuffer>(njs::unwrapValue(env, bufferValue));
    out.offset = static_cast<uint64_t>(
        njs::getNamedNumber(env, resource, "offset", 0));
    double size = njs::getNamedNumber(env, resource, "size", -1);
    out.size = size < 0 ? WGPU_WHOLE_SIZE : static_cast<uint64_t>(size);
    return out;
  }

  std::string kind = njs::getNamedString(env, resource, "__kind", "");
  if (kind == "texture-view") {
    out.textureView =
        static_cast<WGPUTextureView>(njs::unwrapValue(env, resource));
  } else if (kind == "sampler") {
    out.sampler = static_cast<WGPUSampler>(njs::unwrapValue(env, resource));
  }
  return out;
}

}  // namespace

napi_value deviceCreateBuffer(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  auto* device =
      static_cast<WGPUDevice>(njs::unwrapThis(env, info, &argc, args));
  if (!device || argc < 1) {
    njs::throwError(env, "createBuffer: descriptor obrigatório");
    return njs::undefined(env);
  }

  WGPUBufferDescriptor desc = WGPU_BUFFER_DESCRIPTOR_INIT;
  desc.size = static_cast<uint64_t>(
      njs::getNamedNumber(env, args[0], "size", 0));
  desc.usage = static_cast<WGPUBufferUsage>(
      njs::getNamedNumber(env, args[0], "usage", 0));
  desc.mappedAtCreation =
      njs::getNamedBool(env, args[0], "mappedAtCreation", false);

  WGPUBuffer buffer = wgpuDeviceCreateBuffer(device, &desc);
  countCreatedBuffer(desc.size);
  napi_value obj = njs::wrapHandle(env, buffer, finalizeBuffer);
  njs::setMethod(env, obj, "destroy", bufferDestroy);
  njs::setMethod(env, obj, "getMappedRange", bufferGetMappedRange);
  njs::setMethod(env, obj, "unmap", bufferUnmap);
  njs::setMethod(env, obj, "mapAsync", bufferMapAsync);
  // GPUBuffer.size/usage (o three lê size em várias operações).
  napi_value sizeValue = nullptr;
  napi_create_double(env, static_cast<double>(desc.size), &sizeValue);
  napi_set_named_property(env, obj, "size", sizeValue);
  napi_value usageValue = nullptr;
  napi_create_uint32(env, static_cast<uint32_t>(desc.usage), &usageValue);
  napi_set_named_property(env, obj, "usage", usageValue);
  return obj;
}

napi_value deviceCreateBindGroup(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  auto* device =
      static_cast<WGPUDevice>(njs::unwrapThis(env, info, &argc, args));
  if (!device || argc < 1) {
    njs::throwError(env, "createBindGroup: descriptor obrigatório");
    return njs::undefined(env);
  }

  napi_value layoutValue = nullptr;
  njs::getNamed(env, args[0], "layout", &layoutValue);
  auto* layout =
      static_cast<WGPUBindGroupLayout>(njs::unwrapValue(env, layoutValue));

  std::vector<WGPUBindGroupEntry> entries;
  napi_value entriesValue = nullptr;
  if (njs::getNamed(env, args[0], "entries", &entriesValue)) {
    uint32_t count = 0;
    napi_get_array_length(env, entriesValue, &count);
    entries.reserve(count);
    for (uint32_t i = 0; i < count; ++i) {
      napi_value entry = nullptr;
      napi_get_element(env, entriesValue, i, &entry);
      entries.push_back(parseBindGroupEntry(env, entry));
    }
  }

  WGPUBindGroupDescriptor desc = WGPU_BIND_GROUP_DESCRIPTOR_INIT;
  desc.layout = layout;
  desc.entryCount = entries.size();
  desc.entries = entries.data();
  WGPUBindGroup group = wgpuDeviceCreateBindGroup(device, &desc);
  return njs::wrapHandle(env, group, finalizeBindGroup);
}

// writeBuffer(buffer, bufferOffset, data[, dataOffset[, size]])
// dataOffset/size em ELEMENTOS pra TypedArray, bytes pra ArrayBuffer (spec).
napi_value queueWriteBuffer(napi_env env, napi_callback_info info) {
  size_t argc = 5;
  napi_value args[5];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  HostGpu* gpu = gpuState();
  if (argc < 3 || !gpu || !gpu->queue) {
    njs::throwError(env, "writeBuffer: (buffer, offset, data) obrigatórios");
    return njs::undefined(env);
  }

  auto* buffer = static_cast<WGPUBuffer>(njs::unwrapValue(env, args[0]));
  double bufferOffset = 0;
  napi_get_value_double(env, args[1], &bufferOffset);

  void* data = nullptr;
  size_t totalBytes = 0;
  size_t elementSize = 1;
  if (!buffer || !getJsBytes(env, args[2], &data, &totalBytes, &elementSize))
    return njs::undefined(env);

  double dataOffsetElements = 0;
  if (argc >= 4) napi_get_value_double(env, args[3], &dataOffsetElements);
  size_t dataOffsetBytes =
      static_cast<size_t>(dataOffsetElements) * elementSize;

  size_t writeBytes = totalBytes - dataOffsetBytes;
  if (argc >= 5) {
    double sizeElements = 0;
    if (napi_get_value_double(env, args[4], &sizeElements) == napi_ok)
      writeBytes = static_cast<size_t>(sizeElements) * elementSize;
  }

  if (writeBytes > 0 && dataOffsetBytes + writeBytes <= totalBytes) {
    bumpWriteBuffer();
    wgpuQueueWriteBuffer(gpu->queue, buffer,
                         static_cast<uint64_t>(bufferOffset),
                         static_cast<uint8_t*>(data) + dataOffsetBytes,
                         writeBytes);
  }
  return njs::undefined(env);
}

void registerBufferUsageGlobals(napi_env env) {
  napi_value global = nullptr;
  napi_get_global(env, &global);

  // Valores da spec WebGPU — idênticos aos WGPUBufferUsage_* do webgpu.h.
  const struct {
    const char* name;
    uint32_t value;
  } kUsages[] = {
      {"MAP_READ", 0x0001},   {"MAP_WRITE", 0x0002}, {"COPY_SRC", 0x0004},
      {"COPY_DST", 0x0008},   {"INDEX", 0x0010},     {"VERTEX", 0x0020},
      {"UNIFORM", 0x0040},    {"STORAGE", 0x0080},   {"INDIRECT", 0x0100},
      {"QUERY_RESOLVE", 0x0200},
  };
  napi_value usage = njs::makeObject(env);
  for (const auto& entry : kUsages) {
    napi_value value = nullptr;
    napi_create_uint32(env, entry.value, &value);
    napi_set_named_property(env, usage, entry.name, value);
  }
  napi_set_named_property(env, global, "GPUBufferUsage", usage);
}

}  // namespace webgpu
