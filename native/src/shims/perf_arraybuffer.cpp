#include "perf_arraybuffer.h"

#include <array>
#include <atomic>
#include <cstdio>

#include "../napi/napi_util.h"

namespace shims {
namespace {

struct Counter {
  std::atomic<uint64_t> count{0};
  std::atomic<uint64_t> bytes{0};
};

std::array<Counter, static_cast<size_t>(ArrayBufferSource::kCount)> g_counters;

const char* sourceLabel(ArrayBufferSource source) {
  switch (source) {
    case ArrayBufferSource::kPak: return "pak";
    case ArrayBufferSource::kImageDecode: return "img";
    case ArrayBufferSource::kKtx2: return "ktx2";
    case ArrayBufferSource::kIoPool: return "io";
    case ArrayBufferSource::kFiles: return "files";
    case ArrayBufferSource::kTextRaster: return "text";
    case ArrayBufferSource::kInflate: return "inflate";
    default: return "?";
  }
}

}  // namespace

void trackArrayBufferBytes(ArrayBufferSource source, size_t bytes) {
  auto& c = g_counters[static_cast<size_t>(source)];
  c.count.fetch_add(1, std::memory_order_relaxed);
  c.bytes.fetch_add(bytes, std::memory_order_relaxed);
}

int dumpArrayBufferStats(char* buf, size_t bufSize) {
  int written = 0;
  for (size_t i = 0; i < g_counters.size(); ++i) {
    const auto& c = g_counters[i];
    const uint64_t count = c.count.load(std::memory_order_relaxed);
    const double mb = static_cast<double>(c.bytes.load(std::memory_order_relaxed)) / (1024.0 * 1024.0);
    const int n = std::snprintf(buf + written, bufSize > static_cast<size_t>(written) ? bufSize - written : 0,
                                 "%s%s=%llux/%.1fMB", written ? " " : "",
                                 sourceLabel(static_cast<ArrayBufferSource>(i)),
                                 static_cast<unsigned long long>(count), mb);
    if (n > 0) written += n;
  }
  return written;
}

int dumpImageReleaseStats(napi_env env, char* buf, size_t bufSize) {
  constexpr double kBytesPerMB = 1024.0 * 1024.0;
  napi_value global = nullptr;
  napi_value stats = nullptr;
  double released = 0;
  double releasedBytes = 0;
  double redecodes = 0;
  if (napi_get_global(env, &global) == napi_ok &&
      njs::getNamed(env, global, "__cortexImageReleaseStats", &stats)) {
    released = njs::getNamedNumber(env, stats, "released", 0);
    releasedBytes = njs::getNamedNumber(env, stats, "releasedBytes", 0);
    redecodes = njs::getNamedNumber(env, stats, "redecodes", 0);
  }
  const int n = std::snprintf(buf, bufSize, "img-solto=%.0f/%.1fMB img-redecode=%.0f",
                              released, releasedBytes / kBytesPerMB, redecodes);
  return n > 0 ? n : 0;
}

}  // namespace shims
