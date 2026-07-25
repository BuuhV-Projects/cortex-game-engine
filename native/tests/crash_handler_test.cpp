// Testes do log de performance/erro em arquivo (TDR-0004, SPEC-0152): o
// perf-log.txt é a ferramenta de diagnóstico de vazamento — regressão aqui
// significa investigar às cegas.
#include <cstdio>
#include <cstring>
#include <string>

#include "../src/core/crash_handler.h"
#include "harness.h"

namespace tests {

namespace {

/** Lê um arquivo inteiro (vazio se não existir). */
std::string readAll(const char* path) {
  FILE* f = std::fopen(path, "rb");
  if (!f) return "";
  std::string out;
  char buf[4096];
  size_t n = 0;
  while ((n = std::fread(buf, 1, sizeof(buf), f)) > 0) out.append(buf, n);
  std::fclose(f);
  return out;
}

}  // namespace

void testAppendPerfLog() {
  // O runner roda no diretório de build — usa a pasta corrente como logDir.
  std::remove("perf-log.txt");
  core::installCrashHandler(".");
  core::appendPerfLog("vram=%dMB ws=%dMB", 1507, 1364);
  core::appendPerfLog("texturas VIVAS (%d):", 45);

  const std::string content = readAll("perf-log.txt");
  CHECK(content.find("vram=1507MB ws=1364MB") != std::string::npos);
  CHECK(content.find("texturas VIVAS (45):") != std::string::npos);
  // Toda linha nasce timestampada ([HH:MM:SS] ...).
  CHECK(content.find('[') == 0);
  std::remove("perf-log.txt");
}

}  // namespace tests
