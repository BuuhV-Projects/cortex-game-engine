#include "perf_trace.h"

#include <windows.h>

#include <cstdio>
#include <cstring>
#include <string>

#include "../napi/napi_util.h"

namespace shims {
namespace {

// Caminho do arquivo de trace, resolvido no registro (logDir + nome fixo).
char g_tracePath[MAX_PATH] = {0};

// Nome do arquivo de saída — JSONL: uma amostra por linha, pra ferramenta ler.
constexpr const char* kTraceFileName = "perf-trace.jsonl";

// Acrescenta uma linha ao arquivo. Abre/fecha por chamada: a amostragem é rara
// (2×/s), e manter o handle aberto arriscaria perder o buffer num crash — que é
// justamente quando o trace importa.
void appendLine(const std::string& line) {
  if (!g_tracePath[0]) return;
  FILE* f = nullptr;
  if (fopen_s(&f, g_tracePath, "ab") == 0 && f != nullptr) {
    std::fwrite(line.data(), 1, line.size(), f);
    std::fputc('\n', f);
    std::fclose(f);
  }
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
    // confunde a leitura (o `t` reinicia do zero a cada boot).
    FILE* f = nullptr;
    if (fopen_s(&f, g_tracePath, "wb") == 0 && f != nullptr) std::fclose(f);
  }
  napi_value global = nullptr;
  napi_get_global(env, &global);
  njs::setMethod(env, global, "__cortexPerfTrace", jsPerfTrace);
}

}  // namespace shims
