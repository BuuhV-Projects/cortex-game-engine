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

  // ── App id da Steam (ADR-0174) ────────────────────────────────────────────
  // Espelha `steamAppIdOf` de native/scripts/game-config.mjs: se a regra mudar
  // num lado, mude no outro — o export valida e o host consome o MESMO campo.

  // Número cru, como o Studio grava.
  writeFile("cortex.json", "{ \"id\": \"x\", \"steamAppId\": 480 }\n");
  CHECK(core::loadGameConfig("./", "fb").steamAppId == 480u);

  // Entre aspas: erro provável de quem edita o JSON à mão — toleramos.
  writeFile("cortex.json", "{ \"id\": \"x\", \"steamAppId\": \"480\" }\n");
  CHECK(core::loadGameConfig("./", "fb").steamAppId == 480u);

  // Ausente → kNoSteamAppId: o jogo abre normalmente, só sem Steam.
  writeFile("cortex.json", "{ \"id\": \"x\" }\n");
  CHECK(core::loadGameConfig("./", "fb").steamAppId == core::kNoSteamAppId);

  // Não-numérico e vazio não viram id.
  writeFile("cortex.json", "{ \"id\": \"x\", \"steamAppId\": \"abc\" }\n");
  CHECK(core::loadGameConfig("./", "fb").steamAppId == core::kNoSteamAppId);
  writeFile("cortex.json", "{ \"id\": \"x\", \"steamAppId\": \"\" }\n");
  CHECK(core::loadGameConfig("./", "fb").steamAppId == core::kNoSteamAppId);

  // Acima de uint32 estoura → tratado como ausente (nunca faz wrap silencioso).
  writeFile("cortex.json", "{ \"id\": \"x\", \"steamAppId\": 99999999999 }\n");
  CHECK(core::loadGameConfig("./", "fb").steamAppId == core::kNoSteamAppId);

  // Convive com os outros campos, em qualquer ordem.
  writeFile("cortex.json",
            "{\n  \"steamAppId\": 3241660,\n  \"id\": \"rush\",\n  \"debug\": true\n}\n");
  cfg = core::loadGameConfig("./", "fb");
  CHECK(cfg.steamAppId == 3241660u);
  CHECK(cfg.id == "rush");
  CHECK(cfg.debug == true);

  // Arquivo ausente → fallback total.
  std::remove("cortex.json");
  cfg = core::loadGameConfig("./", "fallback");
  CHECK(cfg.id == "fallback");
  CHECK(cfg.debug == false);
  CHECK(cfg.steamAppId == core::kNoSteamAppId);
}

}  // namespace tests
