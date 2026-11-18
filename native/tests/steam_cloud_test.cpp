// Testes do Remote Storage da Steam no host (SPEC-0743): o filtro de nome que
// impede fugir do espaço do app e o no-op seguro do build sem CORTEX_STEAM.
#include <string>

#include "../src/core/steam_cloud.h"
#include "harness.h"

namespace tests {

void testSteamCloudSafeName() {
  CHECK(core::steamCloudSafeName("save.ini") == "save.ini");
  // Recusa (vazio) em vez de limpar: "saves/a.ini" não pode virar "savesa.ini".
  CHECK(core::steamCloudSafeName("saves/a.ini").empty());
  CHECK(core::steamCloudSafeName("../save.ini").empty());
  CHECK(core::steamCloudSafeName("C:\\dados\\config.ini").empty());
  CHECK(core::steamCloudSafeName("a..b").empty());
  CHECK(core::steamCloudSafeName("").empty());
}

void testSteamCloudWithoutSteam() {
  // O alvo de testes não linka o SDK: toda chamada devolve o valor neutro.
  std::string out = "intacto";
  CHECK(!core::steamCloudAvailable());
  CHECK(!core::steamCloudRead("save.ini", &out));
  CHECK(out == "intacto");
  CHECK(!core::steamCloudWrite("save.ini", "x=1"));
  CHECK(!core::steamCloudDelete("save.ini"));
}

}  // namespace tests
