#include "perf_stats.h"

#include <windows.h>

#include <dxgi1_4.h>
#include <psapi.h>

#include "../napi/napi_util.h"

#pragma comment(lib, "dxgi.lib")

namespace shims {
namespace {

// Estado do delta de CPU entre chamadas (o HUD chama ~2×/s).
ULONGLONG g_lastKernel = 0;
ULONGLONG g_lastUser = 0;
ULONGLONG g_lastWall = 0;
DWORD g_cores = 0;

// Adapter DXGI com QueryVideoMemoryInfo (criado 1× na primeira chamada).
IDXGIAdapter3* g_adapter3 = nullptr;
bool g_adapterTried = false;

ULONGLONG toULL(const FILETIME& ft) {
  ULARGE_INTEGER u;
  u.LowPart = ft.dwLowDateTime;
  u.HighPart = ft.dwHighDateTime;
  return u.QuadPart;
}

double cpuPercent() {
  FILETIME creation, exit, kernel, user;
  if (!GetProcessTimes(GetCurrentProcess(), &creation, &exit, &kernel, &user)) return 0;
  FILETIME wallFt;
  GetSystemTimeAsFileTime(&wallFt);
  const ULONGLONG k = toULL(kernel), u = toULL(user), wall = toULL(wallFt);
  double pct = 0;
  if (g_lastWall != 0 && wall > g_lastWall) {
    const double busy = static_cast<double>((k - g_lastKernel) + (u - g_lastUser));
    const double elapsed = static_cast<double>(wall - g_lastWall);
    if (g_cores == 0) {
      SYSTEM_INFO si;
      GetSystemInfo(&si);
      g_cores = si.dwNumberOfProcessors ? si.dwNumberOfProcessors : 1;
    }
    pct = 100.0 * busy / (elapsed * g_cores);
  }
  g_lastKernel = k;
  g_lastUser = u;
  g_lastWall = wall;
  return pct;
}

double workingSetMB() {
  PROCESS_MEMORY_COUNTERS pmc;
  if (!GetProcessMemoryInfo(GetCurrentProcess(), &pmc, sizeof(pmc))) return 0;
  return static_cast<double>(pmc.WorkingSetSize) / (1024.0 * 1024.0);
}

// Uso de memória de vídeo do PROCESSO no adapter 0 (segmento local = VRAM).
// Debug HUD: adapter 0 costuma ser a GPU ativa; casar o LUID do device wgpu
// seria mais preciso, mas não vale a dependência cruzada aqui.
double gpuMemMB() {
  if (!g_adapterTried) {
    g_adapterTried = true;
    IDXGIFactory4* factory = nullptr;
    if (SUCCEEDED(CreateDXGIFactory1(IID_PPV_ARGS(&factory))) && factory) {
      IDXGIAdapter1* adapter = nullptr;
      if (SUCCEEDED(factory->EnumAdapters1(0, &adapter)) && adapter) {
        adapter->QueryInterface(IID_PPV_ARGS(&g_adapter3));
        adapter->Release();
      }
      factory->Release();
    }
  }
  if (!g_adapter3) return 0;
  DXGI_QUERY_VIDEO_MEMORY_INFO info{};
  if (FAILED(g_adapter3->QueryVideoMemoryInfo(0, DXGI_MEMORY_SEGMENT_GROUP_LOCAL, &info))) return 0;
  return static_cast<double>(info.CurrentUsage) / (1024.0 * 1024.0);
}

napi_value jsPerfStats(napi_env env, napi_callback_info) {
  napi_value out = nullptr;
  napi_create_object(env, &out);
  napi_value v = nullptr;
  napi_create_double(env, cpuPercent(), &v);
  napi_set_named_property(env, out, "cpuPercent", v);
  napi_create_double(env, workingSetMB(), &v);
  napi_set_named_property(env, out, "memMB", v);
  napi_create_double(env, gpuMemMB(), &v);
  napi_set_named_property(env, out, "gpuMemMB", v);
  return out;
}

}  // namespace

void registerPerfStats(napi_env env) {
  napi_value global = nullptr;
  napi_get_global(env, &global);
  njs::setMethod(env, global, "__cortexPerfStats", jsPerfStats);
}

}  // namespace shims
