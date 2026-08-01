#include "steam.h"

#include <cstdio>

#include "game_config.h"  // kNoSteamAppId — o sentinela de "não declarado"

#ifdef CORTEX_STEAM
#include <steam/steam_api.h>
#endif

namespace core {
namespace {

// App id efetivo da sessão e disponibilidade das interfaces. Guardados aqui
// porque TODA capacidade (steam_stats/steam_user) checa `steamAvailable()` antes
// de tocar no SDK, e o shim NAPI publica o app id ao JS.
std::uint32_t g_appId = 0;
bool g_available = false;

#ifdef CORTEX_STEAM

// Observa o overlay pra que o jogo possa PAUSAR quando ele abre. O estado vem
// por callback (bombeado pelo RunCallbacks do frame) e é lido por polling — a
// fronteira nativa segue unidirecional, sem agendar chamadas JS a partir de
// callback nativo.
class OverlayWatcher {
 public:
  bool active() const { return active_; }

 private:
  STEAM_CALLBACK(OverlayWatcher, onOverlayActivated, GameOverlayActivated_t);
  bool active_ = false;
};

void OverlayWatcher::onOverlayActivated(GameOverlayActivated_t* param) {
  active_ = param != nullptr && param->m_bActive != 0;
}

// Só nasce DEPOIS de um init bem-sucedido: o CCallback embutido se registra no
// construtor, e registrar antes do SteamAPI_Init não vale.
OverlayWatcher* g_overlay = nullptr;

#endif  // CORTEX_STEAM

}  // namespace

bool initSteam(std::uint32_t appId) {
  // Jogo sem Steam declarada (cortex.json sem steamAppId): não é erro — o host é
  // o MESMO binário do export PC. Segue sem tocar no SDK. O portão que exige o
  // app id está no export `--steam` (ADR-0174), não aqui: um build já pronto
  // nunca deve deixar de abrir na mão do jogador por causa disso.
  if (appId == kNoSteamAppId) {
    std::fprintf(stderr, "[steam] sem steamAppId no cortex.json — seguindo sem Steam\n");
    return true;
  }
  g_appId = appId;
#ifdef CORTEX_STEAM
  // Aberto fora da Steam? Relança pela Steam (em dev, `steam_appid.txt` ao lado
  // do exe evita o relaunch). Se relançar, este processo deve sair.
  if (SteamAPI_RestartAppIfNecessary(appId)) {
    std::fprintf(stderr, "[steam] relançando via Steam (app %u)...\n", appId);
    return false;
  }
  if (SteamAPI_Init()) {
    g_available = true;
    g_overlay = new OverlayWatcher();
    std::fprintf(stderr, "[steam] init OK (app %u)\n", appId);
  } else {
    // Steam offline / sem steam_appid.txt: o jogo roda, só sem overlay/conquistas.
    std::fprintf(stderr,
                 "[steam] init falhou (Steam offline ou sem steam_appid.txt) — seguindo sem Steam\n");
  }
#else
  // Host desktop/GDK: o jogo pode até declarar app id, mas este binário não
  // linka o SDK. Avisa uma vez pra ninguém caçar conquistas que não vêm.
  std::fprintf(stderr, "[steam] host sem CORTEX_STEAM — app %u ignorado\n", appId);
#endif
  return true;
}

void runSteamCallbacks() {
  if (!g_available) return;
#ifdef CORTEX_STEAM
  SteamAPI_RunCallbacks();
#endif
}

void shutdownSteam() {
  if (!g_available) return;
  g_available = false;
#ifdef CORTEX_STEAM
  // Antes do Shutdown: o CCallback se desregistra no destrutor, e destruí-lo
  // depois de derrubar a API deixaria o SDK com um ponteiro pendurado.
  delete g_overlay;
  g_overlay = nullptr;
  SteamAPI_Shutdown();
#endif
}

bool steamOverlayActive() {
#ifdef CORTEX_STEAM
  return g_available && g_overlay != nullptr && g_overlay->active();
#else
  return false;
#endif
}

bool steamAvailable() { return g_available; }

std::uint32_t steamAppId() { return g_appId; }

}  // namespace core
