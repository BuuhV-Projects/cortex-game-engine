#include "crash_handler.h"

#include <windows.h>

#include <dbghelp.h>

#include <cstdio>

#pragma comment(lib, "dbghelp.lib")

namespace core {
namespace {

LONG WINAPI onCrash(EXCEPTION_POINTERS* info) {
  const DWORD code = info->ExceptionRecord->ExceptionCode;
  std::fprintf(stderr, "\n[crash] exceção nativa 0x%08lX em %p\n", code,
               info->ExceptionRecord->ExceptionAddress);

  const HANDLE process = GetCurrentProcess();
  SymSetOptions(SYMOPT_UNDNAME | SYMOPT_DEFERRED_LOADS | SYMOPT_LOAD_LINES);
  SymInitialize(process, nullptr, TRUE);

  // Stack walk a partir do contexto da exceção (x64).
  CONTEXT ctx = *info->ContextRecord;
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
        std::fprintf(stderr, "[crash]  #%02d %s+0x%llx (%s:%lu) [%s]\n", i,
                     sym->Name, static_cast<unsigned long long>(disp),
                     line.FileName, line.LineNumber, module);
      } else {
        std::fprintf(stderr, "[crash]  #%02d %s+0x%llx [%s]\n", i, sym->Name,
                     static_cast<unsigned long long>(disp), module);
      }
    } else {
      std::fprintf(stderr, "[crash]  #%02d %p [%s]\n", i,
                   reinterpret_cast<void*>(pc), module);
    }
  }
  std::fflush(stderr);
  return EXCEPTION_EXECUTE_HANDLER;  // encerra o processo após o log
}

}  // namespace

void installCrashHandler() {
  SetUnhandledExceptionFilter(onCrash);
}

}  // namespace core
