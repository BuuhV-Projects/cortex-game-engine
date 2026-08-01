#include "steam_stats.h"

#include "steam.h"

#ifdef CORTEX_STEAM
#include <steam/steam_api.h>
#endif

namespace core {

#ifdef CORTEX_STEAM
namespace {

// Interface de stats, ou nullptr se a Steam não está utilizável nesta sessão.
// Concentra a checagem: `steamAvailable()` cobre o init, e o ponteiro cobre o
// caso raro de a interface não resolver mesmo com init OK.
ISteamUserStats* stats() { return steamAvailable() ? SteamUserStats() : nullptr; }

}  // namespace

bool steamSetAchievement(const std::string& id) {
  ISteamUserStats* api = stats();
  return api != nullptr && api->SetAchievement(id.c_str());
}

bool steamClearAchievement(const std::string& id) {
  ISteamUserStats* api = stats();
  return api != nullptr && api->ClearAchievement(id.c_str());
}

bool steamGetAchievement(const std::string& id) {
  ISteamUserStats* api = stats();
  bool achieved = false;
  // GetAchievement devolve false quando o ID não existe — nesse caso `achieved`
  // fica intocado, e o `&&` garante que não devolvemos lixo de pilha.
  return api != nullptr && api->GetAchievement(id.c_str(), &achieved) && achieved;
}

bool steamSetIntStat(const std::string& name, std::int32_t value) {
  ISteamUserStats* api = stats();
  return api != nullptr && api->SetStat(name.c_str(), value);
}

bool steamSetFloatStat(const std::string& name, float value) {
  ISteamUserStats* api = stats();
  return api != nullptr && api->SetStat(name.c_str(), value);
}

std::int32_t steamGetIntStat(const std::string& name) {
  ISteamUserStats* api = stats();
  std::int32_t value = 0;
  if (api != nullptr) api->GetStat(name.c_str(), &value);
  return value;
}

float steamGetFloatStat(const std::string& name) {
  ISteamUserStats* api = stats();
  float value = 0.0f;
  if (api != nullptr) api->GetStat(name.c_str(), &value);
  return value;
}

bool steamStoreStats() {
  ISteamUserStats* api = stats();
  return api != nullptr && api->StoreStats();
}

#else  // sem CORTEX_STEAM — host desktop/GDK: no-op seguro

bool steamSetAchievement(const std::string&) { return false; }
bool steamClearAchievement(const std::string&) { return false; }
bool steamGetAchievement(const std::string&) { return false; }
bool steamSetIntStat(const std::string&, std::int32_t) { return false; }
bool steamSetFloatStat(const std::string&, float) { return false; }
std::int32_t steamGetIntStat(const std::string&) { return 0; }
float steamGetFloatStat(const std::string&) { return 0.0f; }
bool steamStoreStats() { return false; }

#endif  // CORTEX_STEAM

}  // namespace core
