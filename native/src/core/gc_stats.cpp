#include "gc_stats.h"

#include <atomic>

namespace core {
namespace {

std::atomic<uint64_t> g_youngCount{0};
std::atomic<uint64_t> g_youngMs{0};
std::atomic<uint64_t> g_oldCount{0};
std::atomic<uint64_t> g_oldWallMs{0};
std::atomic<uint64_t> g_oldCpuMs{0};

constexpr std::string_view kYoungCollection = "young";

}  // namespace

GcGeneration generationFromName(std::string_view collectionType) {
  return collectionType == kYoungCollection ? GcGeneration::Young : GcGeneration::Old;
}

void recordGc(GcGeneration generation, uint64_t wallMs, uint64_t cpuMs) {
  if (generation == GcGeneration::Young) {
    g_youngCount.fetch_add(1, std::memory_order_relaxed);
    g_youngMs.fetch_add(wallMs, std::memory_order_relaxed);
    return;
  }
  g_oldCount.fetch_add(1, std::memory_order_relaxed);
  g_oldWallMs.fetch_add(wallMs, std::memory_order_relaxed);
  g_oldCpuMs.fetch_add(cpuMs, std::memory_order_relaxed);
}

GcTotals gcTotals() {
  GcTotals t;
  t.youngCount = g_youngCount.load(std::memory_order_relaxed);
  t.youngMs = g_youngMs.load(std::memory_order_relaxed);
  t.oldCount = g_oldCount.load(std::memory_order_relaxed);
  t.oldWallMs = g_oldWallMs.load(std::memory_order_relaxed);
  t.oldCpuMs = g_oldCpuMs.load(std::memory_order_relaxed);
  return t;
}

void resetGcTotals() {
  g_youngCount = 0;
  g_youngMs = 0;
  g_oldCount = 0;
  g_oldWallMs = 0;
  g_oldCpuMs = 0;
}

}  // namespace core
