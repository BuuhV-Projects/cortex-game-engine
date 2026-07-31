// Testes do log de performance/erro em arquivo (TDR-0004, SPEC-0152): o
// perf-log.txt é a ferramenta de diagnóstico de vazamento — regressão aqui
// significa investigar às cegas.
#include <cstdio>
#include <cstring>
#include <new>
#include <stdexcept>
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

  // DESLIGADO por default (release não ganha arquivo de telemetria).
  core::appendPerfLog("nao deve aparecer");
  CHECK(readAll("perf-log.txt").empty());

  // Ligado (export --debug / dev-run / CORTEX_VRAM_LOG): grava timestampado.
  core::setPerfLogEnabled(true);
  core::appendPerfLog("vram=%dMB ws=%dMB", 1507, 1364);
  core::appendPerfLog("texturas VIVAS (%d):", 45);

  const std::string content = readAll("perf-log.txt");
  CHECK(content.find("vram=1507MB ws=1364MB") != std::string::npos);
  CHECK(content.find("texturas VIVAS (45):") != std::string::npos);
  // Toda linha nasce timestampada ([HH:MM:SS] ...).
  CHECK(content.find('[') == 0);
  core::setPerfLogEnabled(false);
  std::remove("perf-log.txt");
}

// SPEC-0173: um crash mudo custou uma sessão inteira sem deixar pista. Esta é a
// função que transforma "40 frames de símbolo errado" em "class std::bad_alloc
// — bad allocation": se ela regredir, voltamos a depurar às cegas.
void testDescribeCurrentException() {
  char desc[core::kExceptionDescMax];

  // std::exception: tipo E mensagem — a mensagem é quem nomeia o culpado.
  try {
    throw std::runtime_error("falha ao ler asset");
  } catch (...) {
    core::describeCurrentException(desc, sizeof(desc));
  }
  CHECK(std::strstr(desc, "falha ao ler asset") != nullptr);
  CHECK(std::strstr(desc, "runtime_error") != nullptr);

  // bad_alloc é a suspeita nº 1 do crash de 2026-07-31 (resize do tamanho do
  // arquivo, durante o load): tem que sair legível, mesmo com what() curto.
  try {
    throw std::bad_alloc();
  } catch (...) {
    core::describeCurrentException(desc, sizeof(desc));
  }
  CHECK(std::strstr(desc, "bad_alloc") != nullptr);

  // Exceção que não deriva de std::exception não pode virar string vazia.
  try {
    throw 42;
  } catch (...) {
    core::describeCurrentException(desc, sizeof(desc));
  }
  CHECK(std::strstr(desc, "desconhecido") != nullptr);

  // Sem exceção em voo: terminate() por noexcept violado / thread sem join. O
  // diagnóstico DESTE caso é informação, não erro — não pode sair vazio.
  core::describeCurrentException(desc, sizeof(desc));
  CHECK(std::strstr(desc, "sem excecao corrente") != nullptr);

  // Roda em caminho de crash: não pode estourar buffer nem cair com ponteiro
  // nulo (seria um crash DENTRO do handler de crash).
  char tiny[8];
  try {
    throw std::runtime_error("mensagem bem maior que o buffer");
  } catch (...) {
    core::describeCurrentException(tiny, sizeof(tiny));
  }
  CHECK(tiny[sizeof(tiny) - 1] == '\0');
  core::describeCurrentException(nullptr, sizeof(desc));  // não pode crashar
  core::describeCurrentException(desc, 0);                // idem
}

}  // namespace tests
