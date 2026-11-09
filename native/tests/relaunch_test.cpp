// Testes do reinício pedido pelo jogo (SPEC-0717): o relançamento só acontece
// com pedido, uma vez, e uma falha ao abrir o exe vira um quit comum.
#include "../src/core/crash_handler.h"
#include "../src/core/relaunch.h"
#include "harness.h"

namespace tests {

namespace {

int gSpawns = 0;

bool spawnOk() {
  ++gSpawns;
  return true;
}

bool spawnFails() {
  ++gSpawns;
  return false;
}

}  // namespace

void testRelaunchOnlyWhenRequested() {
  core::clearRelaunchRequest();
  gSpawns = 0;

  // Sem pedido (quit comum, fechar janela): não relança.
  CHECK(!core::relaunchIfRequested(spawnOk));
  CHECK(gSpawns == 0);

  // Com pedido: relança uma vez e esquece o pedido.
  core::requestRelaunch();
  CHECK(core::relaunchRequested());
  CHECK(core::relaunchIfRequested(spawnOk));
  CHECK(gSpawns == 1);
  CHECK(!core::relaunchRequested());
  CHECK(!core::relaunchIfRequested(spawnOk));
  CHECK(gSpawns == 1);
}

void testRelaunchFailureOnlyQuits() {
  core::installCrashHandler(".");
  core::clearRelaunchRequest();
  gSpawns = 0;
  core::requestRelaunch();
  CHECK(!core::relaunchIfRequested(spawnFails));
  CHECK(gSpawns == 1);
  CHECK(!core::relaunchRequested());
}

}  // namespace tests
