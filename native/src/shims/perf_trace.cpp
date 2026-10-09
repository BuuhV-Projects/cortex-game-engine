#include "perf_trace.h"

#include <windows.h>

#include <cstdio>
#include <share.h>
#include <cstring>
#include <string>

#include "../napi/napi_util.h"

namespace shims {
namespace {

// Caminho do arquivo de trace, resolvido no registro (logDir + nome fixo).
char g_tracePath[MAX_PATH] = {0};

// Nome do arquivo de saída — JSONL: uma amostra por linha, pra ferramenta ler.
constexpr const char* kTraceFileName = "perf-trace.jsonl";

// Handle aberto na sessão inteira (SPEC-0334). Abrir/fechar por linha custava
// ~0,3 ms — metade da amostra do trace, dentro do quadro. O `fflush` por linha
// entrega os bytes ao SO a cada amostra, então um crash do processo não perde
// nada (o buffer que se perderia é o da CRT, e ele é esvaziado ali).
FILE* g_traceFile = nullptr;

void appendLine(const std::string& line) {
  if (g_traceFile == nullptr) return;
  std::fwrite(line.data(), 1, line.size(), g_traceFile);
  std::fputc('\n', g_traceFile);
  std::fflush(g_traceFile);
}

napi_value jsPerfTrace(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1] = {nullptr};
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  if (argc >= 1 && argv[0] != nullptr) appendLine(njs::toString(env, argv[0]));
  return nullptr;
}

}  // namespace

void registerPerfTrace(napi_env env, const char* logDir) {
  if (logDir && logDir[0]) {
    std::snprintf(g_tracePath, sizeof(g_tracePath), "%s%s%s", logDir,
                  (logDir[std::strlen(logDir) - 1] == '\\' || logDir[std::strlen(logDir) - 1] == '/') ? "" : "\\",
                  kTraceFileName);
    // Sessão nova começa arquivo novo: misturar corridas no mesmo arquivo
    // confunde a leitura (o `t` reinicia do zero a cada boot). `_SH_DENYWR`
    // deixa outros processos LEREM com o jogo aberto (sondas/piloto seguem o
    // trace ao vivo); `fopen_s` negava a leitura a todos.
    if (g_traceFile == nullptr) g_traceFile = _fsopen(g_tracePath, "wb", _SH_DENYWR);
  }
  napi_value global = nullptr;
  napi_get_global(env, &global);
  njs::setMethod(env, global, "__cortexPerfTrace", jsPerfTrace);
}

}  // namespace shims
