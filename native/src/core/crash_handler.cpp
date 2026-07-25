#include "crash_handler.h"

#include <windows.h>

#include <dbghelp.h>

#include <csignal>
#include <cstdio>
#include <cstring>
#include <ctime>

#pragma comment(lib, "dbghelp.lib")

namespace core {
namespace {

// Pasta onde o error_log.txt é gravado (dir do jogo). Fixa no install.
char g_logDir[MAX_PATH] = "";

// Escreve a MESMA linha no stderr e no error_log.txt (aberto por linha —
// estamos crashando, melhor durabilidade do que elegância).
void logLineV(const char* fmt, va_list args) {
  char line[2048];
  vsnprintf(line, sizeof(line), fmt, args);

  std::fprintf(stderr, "%s\n", line);
  if (g_logDir[0]) {
    char path[MAX_PATH];
    snprintf(path, sizeof(path), "%serror_log.txt", g_logDir);
    if (FILE* f = std::fopen(path, "ab")) {
      std::fprintf(f, "%s\n", line);
      std::fclose(f);
    }
  }
  std::fflush(stderr);
}

void logLine(const char* fmt, ...) {
  va_list args;
  va_start(args, fmt);
  logLineV(fmt, args);
  va_end(args);
}

void logHeader(const char* kind) {
  std::time_t now = std::time(nullptr);
  char stamp[64] = "";
  std::tm tmv{};
  if (localtime_s(&tmv, &now) == 0) std::strftime(stamp, sizeof(stamp), "%Y-%m-%d %H:%M:%S", &tmv);
  logLine("");
  logLine("==== %s — %s ====", kind, stamp);
}

// Backtrace simbolizado (DbgHelp + PDB quando presente). `ctx` opcional — sem
// contexto (abort/panic) captura a partir do próprio chamador.
void logBacktrace(CONTEXT* ctxIn) {
  const HANDLE process = GetCurrentProcess();
  SymSetOptions(SYMOPT_UNDNAME | SYMOPT_DEFERRED_LOADS | SYMOPT_LOAD_LINES);
  SymInitialize(process, nullptr, TRUE);

  CONTEXT ctx;
  if (ctxIn) {
    ctx = *ctxIn;
  } else {
    RtlCaptureContext(&ctx);
  }

  STACKFRAME64 frame{};
  frame.AddrPC.Offset = ctx.Rip;
  frame.AddrPC.Mode = AddrModeFlat;
  frame.AddrFrame.Offset = ctx.Rbp;
  frame.AddrFrame.Mode = AddrModeFlat;
  frame.AddrStack.Offset = ctx.Rsp;
  frame.AddrStack.Mode = AddrModeFlat;

  char symBuf[sizeof(SYMBOL_INFO) + 256]{};
  auto* sym = reinterpret_cast<SYMBOL_INFO*>(symBuf);
  sym->SizeOfStruct = sizeof(SYMBOL_INFO);
  sym->MaxNameLen = 255;

  for (int i = 0; i < 40; ++i) {
    if (!StackWalk64(IMAGE_FILE_MACHINE_AMD64, process, GetCurrentThread(),
                     &frame, &ctx, nullptr, SymFunctionTableAccess64,
                     SymGetModuleBase64, nullptr) ||
        frame.AddrPC.Offset == 0) {
      break;
    }
    const DWORD64 pc = frame.AddrPC.Offset;
    DWORD64 disp = 0;
    char module[MAX_PATH] = "?";
    HMODULE mod = nullptr;
    if (GetModuleHandleExA(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS |
                               GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
                           reinterpret_cast<LPCSTR>(pc), &mod) &&
        mod) {
      GetModuleFileNameA(mod, module, MAX_PATH);
    }
    if (SymFromAddr(process, pc, &disp, sym)) {
      IMAGEHLP_LINE64 line{};
      line.SizeOfStruct = sizeof(line);
      DWORD lineDisp = 0;
      if (SymGetLineFromAddr64(process, pc, &lineDisp, &line)) {
        logLine("[crash]  #%02d %s+0x%llx (%s:%lu) [%s]", i, sym->Name,
                static_cast<unsigned long long>(disp), line.FileName,
                line.LineNumber, module);
      } else {
        logLine("[crash]  #%02d %s+0x%llx [%s]", i, sym->Name,
                static_cast<unsigned long long>(disp), module);
      }
    } else {
      logLine("[crash]  #%02d %p [%s]", i, reinterpret_cast<void*>(pc), module);
    }
  }
}

LONG WINAPI onCrash(EXCEPTION_POINTERS* info) {
  logHeader("CRASH (exceção nativa)");
  logLine("[crash] exceção 0x%08lX em %p", info->ExceptionRecord->ExceptionCode,
          info->ExceptionRecord->ExceptionAddress);
  logBacktrace(info->ContextRecord);
  return EXCEPTION_EXECUTE_HANDLER;  // encerra o processo após o log
}

// abort() (ex.: panic do wgpu em Rust) NÃO passa pelo exception filter — o
// caminho é o signal handler do CRT. O backtrace daqui inclui o abort/panic.
void onAbort(int) {
  logHeader("ABORT (panic — provável wgpu/Rust; ver linhas acima no stderr)");
  logBacktrace(nullptr);
  // Segue o abort normal (sem re-entrar no handler).
  std::signal(SIGABRT, SIG_DFL);
}

}  // namespace

void appendErrorLog(const char* fmt, ...) {
  va_list args;
  va_start(args, fmt);
  logLineV(fmt, args);
  va_end(args);
}

namespace {
// Desligado por default: só o export com métricas/dev-run/CORTEX_VRAM_LOG
// ligam (ver appendPerfLog no header) — release não ganha arquivo de log.
bool g_perfLogEnabled = false;
}  // namespace

void setPerfLogEnabled(bool enabled) { g_perfLogEnabled = enabled; }

void appendPerfLog(const char* fmt, ...) {
  if (!g_perfLogEnabled || !g_logDir[0]) return;
  char line[2048];
  va_list args;
  va_start(args, fmt);
  vsnprintf(line, sizeof(line), fmt, args);
  va_end(args);

  char path[MAX_PATH];
  snprintf(path, sizeof(path), "%sperf-log.txt", g_logDir);
  if (FILE* f = std::fopen(path, "ab")) {
    std::time_t now = std::time(nullptr);
    std::tm tm{};
    localtime_s(&tm, &now);
    std::fprintf(f, "[%02d:%02d:%02d] %s\n", tm.tm_hour, tm.tm_min, tm.tm_sec, line);
    std::fclose(f);
  }
}

void installCrashHandler(const char* logDir) {
  if (logDir && logDir[0]) {
    strncpy_s(g_logDir, logDir, _TRUNCATE);
    const size_t len = std::strlen(g_logDir);
    if (len > 0 && g_logDir[len - 1] != '\\' && g_logDir[len - 1] != '/') {
      strncat_s(g_logDir, "\\", _TRUNCATE);
    }
    // Sem console (export aberto por 2-clique): o stderr é um buraco negro —
    // redireciona pro error_log.txt, capturando o que NÃO passa pelos nossos
    // handlers (ex.: o texto do panic do Rust/wgpu "Caused by: …"). Rodando
    // de um terminal (dev), o stderr fica onde está.
    if (GetConsoleWindow() == nullptr) {
      char path[MAX_PATH];
      snprintf(path, sizeof(path), "%serror_log.txt", g_logDir);
      FILE* redirected = nullptr;
      freopen_s(&redirected, path, "ab", stderr);
    }
  }
  SetUnhandledExceptionFilter(onCrash);
  std::signal(SIGABRT, onAbort);
}

}  // namespace core
