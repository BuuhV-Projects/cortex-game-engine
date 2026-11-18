#include "steam_cloud.h"

#include "steam.h"

#ifdef CORTEX_STEAM
#include <steam/steam_api.h>

#include <cstdint>
#include <limits>
#endif

namespace core {

std::string steamCloudSafeName(const std::string& name) {
  std::string out;
  for (char c : name) {
    if (c == '/' || c == '\\' || c == ':') continue;  // sem componente de caminho
    if (c == '.' && !out.empty() && out.back() == '.') continue;  // colapsa ".."
    out += c;
  }
  return out;
}

#ifdef CORTEX_STEAM
namespace {

// O SDK mede tamanho em int32: arquivo maior que isso não cabe numa chamada.
constexpr std::size_t kMaxCloudFileBytes =
    static_cast<std::size_t>(std::numeric_limits<std::int32_t>::max());

ISteamRemoteStorage* storage() {
  return steamAvailable() ? SteamRemoteStorage() : nullptr;
}

}  // namespace

bool steamCloudAvailable() { return storage() != nullptr; }

bool steamCloudRead(const std::string& name, std::string* out) {
  ISteamRemoteStorage* remote = storage();
  const std::string safe = steamCloudSafeName(name);
  if (remote == nullptr || out == nullptr || safe.empty()) return false;
  if (!remote->FileExists(safe.c_str())) return false;
  const std::int32_t size = remote->GetFileSize(safe.c_str());
  if (size < 0) return false;
  out->assign(static_cast<std::size_t>(size), '\0');
  if (size == 0) return true;
  // Leitura curta = arquivo trocado no meio (sync) ou erro: não devolve meio save.
  return remote->FileRead(safe.c_str(), &(*out)[0], size) == size;
}

bool steamCloudWrite(const std::string& name, const std::string& data) {
  ISteamRemoteStorage* remote = storage();
  const std::string safe = steamCloudSafeName(name);
  if (remote == nullptr || safe.empty() || data.size() > kMaxCloudFileBytes) return false;
  return remote->FileWrite(safe.c_str(), data.data(), static_cast<std::int32_t>(data.size()));
}

bool steamCloudDelete(const std::string& name) {
  ISteamRemoteStorage* remote = storage();
  const std::string safe = steamCloudSafeName(name);
  if (remote == nullptr || safe.empty()) return false;
  return remote->FileDelete(safe.c_str());
}

#else  // sem CORTEX_STEAM — host desktop/GDK: no-op seguro

bool steamCloudAvailable() { return false; }
bool steamCloudRead(const std::string&, std::string*) { return false; }
bool steamCloudWrite(const std::string&, const std::string&) { return false; }
bool steamCloudDelete(const std::string&) { return false; }

#endif  // CORTEX_STEAM

}  // namespace core
