#include "relaunch.h"

#include <atomic>
#include <cstdio>
#include <cwchar>

#include "crash_handler.h"

#if defined(_WIN32) && !defined(CORTEX_GDK)
#define CORTEX_CAN_RELAUNCH 1
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>

#include <vector>
#endif

namespace core {
namespace {

std::atomic<bool> gRelaunch{false};

#ifdef CORTEX_CAN_RELAUNCH
/** Caminho completo do exe (cresce o buffer até caber: caminhos longos passam de MAX_PATH). */
std::vector<wchar_t> exePathW() {
  std::vector<wchar_t> path(MAX_PATH);
  for (;;) {
    const DWORD n = GetModuleFileNameW(nullptr, path.data(), static_cast<DWORD>(path.size()));
    if (n == 0) return {};
    if (n < path.size()) {
      path.resize(n + 1);
      return path;
    }
    path.resize(path.size() * 2);
  }
}
#endif

}  // namespace

bool relaunchSupported() {
#ifdef CORTEX_CAN_RELAUNCH
  return true;
#else
  return false;
#endif
}

void requestRelaunch() { gRelaunch.store(true); }

bool relaunchRequested() { return gRelaunch.load(); }

void clearRelaunchRequest() { gRelaunch.store(false); }

bool spawnSelf() {
#ifdef CORTEX_CAN_RELAUNCH
  std::vector<wchar_t> exe = exePathW();
  if (exe.empty()) return false;
  // CreateProcessW pode escrever no buffer da linha de comando: copia a do processo atual.
  const wchar_t* current = GetCommandLineW();
  std::vector<wchar_t> cmd(current, current + wcslen(current) + 1);
  STARTUPINFOW si{};
  si.cb = sizeof(si);
  PROCESS_INFORMATION pi{};
  // ambiente e pasta corrente herdados (nullptr): o filho abre igual ao pai
  if (!CreateProcessW(exe.data(), cmd.data(), nullptr, nullptr, FALSE, 0, nullptr, nullptr, &si, &pi)) return false;
  CloseHandle(pi.hThread);
  CloseHandle(pi.hProcess);
  return true;
#else
  return false;
#endif
}

bool relaunchIfRequested(SpawnFn spawn) {
  if (!gRelaunch.exchange(false)) return false;
  if (spawn && spawn()) {
    std::printf("[restart] host relançado\n");
    return true;
  }
  appendErrorLog("[restart] falha ao relançar o host; encerrando sem reabrir");
  return false;
}

}  // namespace core
