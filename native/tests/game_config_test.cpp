// Testes do cortex.json do host (ADR-0126 + gate de telemetria do TDR-0004):
// id/name com fallback e o `debug` que autoriza o perf-log no export --debug.
#include <cstdio>

#include "../src/core/game_config.h"
#include "harness.h"

namespace tests {

namespace {

void writeFile(const char* path, const char* content) {
  FILE* f = std::fopen(path, "wb");
  if (!f) return;
  std::fputs(content, f);
  std::fclose(f);
}

}  // namespace

void testGameConfig() {
  // Completo, com debug:true (export --debug).
  writeFile("cortex.json", "{\n  \"id\": \"cute-rush\",\n  \"name\": \"Cute Rush\",\n  \"debug\": true\n}\n");
  core::GameConfig cfg = core::loadGameConfig("./", "fallback");
  CHECK(cfg.id == "cute-rush");
  CHECK(cfg.name == "Cute Rush");
  CHECK(cfg.debug == true);

  // Sem debug (export release) → false.
  writeFile("cortex.json", "{ \"id\": \"cute-rush\" }\n");
  cfg = core::loadGameConfig("./", "fallback");
  CHECK(cfg.debug == false);
  CHECK(cfg.name == "cute-rush");  // name ausente cai no id

  // `debug` com valor não-true não liga (defensivo).
  writeFile("cortex.json", "{ \"id\": \"x\", \"debug\": \"true\" }\n");
  CHECK(core::loadGameConfig("./", "fb").debug == false);

  // Arquivo ausente → fallback total.
  std::remove("cortex.json");
  cfg = core::loadGameConfig("./", "fallback");
  CHECK(cfg.id == "fallback");
  CHECK(cfg.debug == false);
}

}  // namespace tests
