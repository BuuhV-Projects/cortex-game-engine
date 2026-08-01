#include "steam_user.h"

#include "steam.h"

#ifdef CORTEX_STEAM
#include <steam/steam_api.h>

#include <cinttypes>
#include <cstdio>
#endif

namespace core {

#ifdef CORTEX_STEAM
namespace {

// Dígitos de um uint64 em decimal (20) + terminador. SteamID64 sempre cabe.
constexpr int kSteamIdTextSize = 21;

}  // namespace

std::string steamPlayerName() {
  if (!steamAvailable() || SteamFriends() == nullptr) return "";
  const char* name = SteamFriends()->GetPersonaName();
  return name != nullptr ? std::string(name) : std::string();
}

std::string steamPlayerId() {
  if (!steamAvailable() || SteamUser() == nullptr) return "";
  char text[kSteamIdTextSize] = {};
  std::snprintf(text, sizeof(text), "%" PRIu64,
                static_cast<std::uint64_t>(SteamUser()->GetSteamID().ConvertToUint64()));
  return std::string(text);
}

std::string steamLanguage() {
  if (!steamAvailable() || SteamApps() == nullptr) return "";
  const char* lang = SteamApps()->GetCurrentGameLanguage();
  return lang != nullptr ? std::string(lang) : std::string();
}

bool steamOpenOverlay(const std::string& page) {
  if (!steamAvailable() || SteamFriends() == nullptr) return false;
  // ActivateGameOverlay é void — não há como saber se o overlay realmente
  // abriu (ele pode estar desligado nas opções da Steam). O `true` aqui
  // significa "pedido enviado", e quem quiser confirmar lê steamOverlayActive().
  SteamFriends()->ActivateGameOverlay(page.empty() ? "Friends" : page.c_str());
  return true;
}

#else  // sem CORTEX_STEAM — host desktop/GDK: no-op seguro

std::string steamPlayerName() { return ""; }
std::string steamPlayerId() { return ""; }
std::string steamLanguage() { return ""; }
bool steamOpenOverlay(const std::string&) { return false; }

#endif  // CORTEX_STEAM

}  // namespace core
