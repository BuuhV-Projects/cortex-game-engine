#include "crash_handler.h"

#include <windows.h>

#include <dbghelp.h>

#include <csignal>
#include <cstdio>
#include <cstring>
#include <ctime>
#include <exception>
#include <stdexcept>
#include <typeinfo>

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
//
// O cabeçalho NÃO chuta a origem: o handler não tem como saber se veio de panic
// do Rust, de hermes_fatal ou de um abort() nosso — e afirmar atrapalhou a
// leitura de um crash real (SPEC-0173). Quem sabe é a linha de causa acima.
void onAbort(int) {
  logHeader("ABORT (abort/panic — a causa, quando houver, está nas linhas acima)");
  logBacktrace(nullptr);
  // Segue o abort normal (sem re-entrar no handler).
  std::signal(SIGABRT, SIG_DFL);
}

// Exceção C++ que ninguém capturou (ou noexcept violado) chama terminate() —
// que sem isto vira um abort MUDO: o tipo e o what() da exceção, a única pista
// que aponta o culpado, se perdiam (SPEC-0173, crash de 2026-07-31).
//
// No MSVC o terminate roda no PRIMEIRO passe do SEH, antes de desenrolar a
// pilha: o backtrace daqui ainda é o do ponto onde a exceção nasceu.
void onTerminate() {
  static bool inTerminate = false;
  if (inTerminate) std::abort();  // exceção DENTRO do handler: aborta seco
  inTerminate = true;

  char desc[kExceptionDescMax];
  describeCurrentException(desc, sizeof(desc));
  logHeader("TERMINATE (excecao C++ nao tratada)");
  logLine("[crash] excecao: %s", desc);
  logBacktrace(nullptr);

  // O abort abaixo dispararia o onAbort e um SEGUNDO backtrace, idêntico e
  // ruidoso — o daqui já é o bom.
  std::signal(SIGABRT, SIG_DFL);
  std::abort();
}

}  // namespace

void describeCurrentException(char* out, size_t size) {
  if (!out || size == 0) return;
  out[0] = '\0';
  if (!std::current_exception()) {
    // terminate() sem exceção em voo: quase sempre `noexcept` violado ou uma
    // std::thread destruída sem join/detach. Saber isso já elimina metade das
    // hipóteses.
    snprintf(out, size,
             "terminate() chamado sem excecao corrente (noexcept violado, ou "
             "std::thread destruida sem join)");
    return;
  }
  // Rethrow + catch é o único jeito portátil de tipar a exceção em voo. O
  // catch(...) fecha o caminho: nada escapa desta função.
  try {
    std::rethrow_exception(std::current_exception());
  } catch (const std::exception& e) {
    snprintf(out, size, "%s — %s", typeid(e).name(), e.what());
  } catch (...) {
    snprintf(out, size, "tipo desconhecido (nao deriva de std::exception)");
  }
}

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
    // handlers. Rodando de um terminal (dev), o stderr fica onde está.
    if (GetConsoleWindow() == nullptr) {
      char path[MAX_PATH];
      snprintf(path, sizeof(path), "%serror_log.txt", g_logDir);
      FILE* redirected = nullptr;
      freopen_s(&redirected, path, "ab", stderr);

      // O freopen_s acima só reaponta o `FILE* stderr` do CRT — NÃO mexe no
      // STD_ERROR_HANDLE do Windows. wgpu_native.dll e rapier_native.dll são
      // Rust e escrevem o panic ("thread '…' panicked at …", "Caused by: …")
      // direto no handle do sistema: sem esta linha, a mensagem que explicaria
      // o crash caía no vácuo (SPEC-0173). FILE_APPEND_DATA + compartilhamento
      // deixam os dois caminhos escreverem no mesmo arquivo, em ordem.
      const HANDLE logHandle =
          CreateFileA(path, FILE_APPEND_DATA, FILE_SHARE_READ | FILE_SHARE_WRITE,
                      nullptr, OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
      if (logHandle != INVALID_HANDLE_VALUE) {
        SetStdHandle(STD_ERROR_HANDLE, logHandle);
      }

      // Panic de Rust só imprime a pilha com isto ligado — e é justo a pilha
      // que localiza o erro dentro do wgpu. Respeita quem já setou por fora.
      constexpr DWORD kEnvProbeMax = 16;
      char existing[kEnvProbeMax];
      if (GetEnvironmentVariableA("RUST_BACKTRACE", existing, kEnvProbeMax) == 0) {
        SetEnvironmentVariableA("RUST_BACKTRACE", "1");
      }
    }
  }
  SetUnhandledExceptionFilter(onCrash);
  std::signal(SIGABRT, onAbort);
  installThreadCrashHandler();  // cobre a thread principal (JS)
}

void installThreadCrashHandler() { std::set_terminate(onTerminate); }

}  // namespace core
