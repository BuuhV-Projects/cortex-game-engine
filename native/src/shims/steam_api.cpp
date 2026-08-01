#include "steam_api.h"

#include <cstdint>
#include <string>

#include "../core/steam.h"
#include "../core/steam_stats.h"
#include "../core/steam_user.h"
#include "../napi/napi_util.h"

namespace shims {
namespace {

// ── Ajuda de fronteira ─────────────────────────────────────────────────────
// As globais da Steam são todas do mesmo feitio (0-2 args primitivos, retorno
// primitivo). Estes helpers evitam repetir napi_get_cb_info em 14 funções.

constexpr size_t kMaxArgs = 2;

// Argumento `index` como string; "" se não veio. Nome de conquista/stat ausente
// vira "" e o core devolve false — sem exceção na fronteira.
std::string argString(napi_env env, napi_callback_info info, size_t index) {
  size_t argc = kMaxArgs;
  napi_value args[kMaxArgs] = {};
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  if (index >= argc) return "";
  return njs::toString(env, args[index]);
}

// Par (nome, valor numérico) — a forma de todo setter de stat.
bool argNameAndNumber(napi_env env, napi_callback_info info, std::string* name, double* value) {
  size_t argc = kMaxArgs;
  napi_value args[kMaxArgs] = {};
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  if (argc < kMaxArgs) return false;
  *name = njs::toString(env, args[0]);
  return napi_get_value_double(env, args[1], value) == napi_ok;
}

napi_value boolResult(napi_env env, bool value) {
  napi_value out = nullptr;
  napi_get_boolean(env, value, &out);
  return out;
}

napi_value numberResult(napi_env env, double value) {
  napi_value out = nullptr;
  napi_create_double(env, value, &out);
  return out;
}

napi_value stringResult(napi_env env, const std::string& value) {
  napi_value out = nullptr;
  napi_create_string_utf8(env, value.c_str(), value.size(), &out);
  return out;
}

// ── Sessão ─────────────────────────────────────────────────────────────────

napi_value jsAvailable(napi_env env, napi_callback_info /*info*/) {
  return boolResult(env, core::steamAvailable());
}

napi_value jsAppId(napi_env env, napi_callback_info /*info*/) {
  return numberResult(env, static_cast<double>(core::steamAppId()));
}

// ── Conquistas ─────────────────────────────────────────────────────────────

napi_value jsSetAchievement(napi_env env, napi_callback_info info) {
  return boolResult(env, core::steamSetAchievement(argString(env, info, 0)));
}

napi_value jsClearAchievement(napi_env env, napi_callback_info info) {
  return boolResult(env, core::steamClearAchievement(argString(env, info, 0)));
}

napi_value jsGetAchievement(napi_env env, napi_callback_info info) {
  return boolResult(env, core::steamGetAchievement(argString(env, info, 0)));
}

// ── Stats ──────────────────────────────────────────────────────────────────

napi_value jsSetIntStat(napi_env env, napi_callback_info info) {
  std::string name;
  double value = 0.0;
  if (!argNameAndNumber(env, info, &name, &value)) return boolResult(env, false);
  return boolResult(env, core::steamSetIntStat(name, static_cast<std::int32_t>(value)));
}

napi_value jsSetFloatStat(napi_env env, napi_callback_info info) {
  std::string name;
  double value = 0.0;
  if (!argNameAndNumber(env, info, &name, &value)) return boolResult(env, false);
  return boolResult(env, core::steamSetFloatStat(name, static_cast<float>(value)));
}

napi_value jsGetIntStat(napi_env env, napi_callback_info info) {
  return numberResult(env, static_cast<double>(core::steamGetIntStat(argString(env, info, 0))));
}

napi_value jsGetFloatStat(napi_env env, napi_callback_info info) {
  return numberResult(env, static_cast<double>(core::steamGetFloatStat(argString(env, info, 0))));
}

napi_value jsStoreStats(napi_env env, napi_callback_info /*info*/) {
  return boolResult(env, core::steamStoreStats());
}

// ── Jogador e overlay ──────────────────────────────────────────────────────

napi_value jsPlayerName(napi_env env, napi_callback_info /*info*/) {
  return stringResult(env, core::steamPlayerName());
}

napi_value jsPlayerId(napi_env env, napi_callback_info /*info*/) {
  return stringResult(env, core::steamPlayerId());
}

napi_value jsLanguage(napi_env env, napi_callback_info /*info*/) {
  return stringResult(env, core::steamLanguage());
}

napi_value jsOverlayActive(napi_env env, napi_callback_info /*info*/) {
  return boolResult(env, core::steamOverlayActive());
}

napi_value jsOpenOverlay(napi_env env, napi_callback_info info) {
  return boolResult(env, core::steamOpenOverlay(argString(env, info, 0)));
}

}  // namespace

void registerSteamApi(napi_env env) {
  napi_value global = nullptr;
  napi_get_global(env, &global);
  njs::setMethod(env, global, "__cortexSteamAvailable", jsAvailable);
  njs::setMethod(env, global, "__cortexSteamAppId", jsAppId);
  njs::setMethod(env, global, "__cortexSteamSetAchievement", jsSetAchievement);
  njs::setMethod(env, global, "__cortexSteamClearAchievement", jsClearAchievement);
  njs::setMethod(env, global, "__cortexSteamGetAchievement", jsGetAchievement);
  njs::setMethod(env, global, "__cortexSteamSetIntStat", jsSetIntStat);
  njs::setMethod(env, global, "__cortexSteamSetFloatStat", jsSetFloatStat);
  njs::setMethod(env, global, "__cortexSteamGetIntStat", jsGetIntStat);
  njs::setMethod(env, global, "__cortexSteamGetFloatStat", jsGetFloatStat);
  njs::setMethod(env, global, "__cortexSteamStoreStats", jsStoreStats);
  njs::setMethod(env, global, "__cortexSteamPlayerName", jsPlayerName);
  njs::setMethod(env, global, "__cortexSteamPlayerId", jsPlayerId);
  njs::setMethod(env, global, "__cortexSteamLanguage", jsLanguage);
  njs::setMethod(env, global, "__cortexSteamOverlayActive", jsOverlayActive);
  njs::setMethod(env, global, "__cortexSteamOpenOverlay", jsOpenOverlay);
}

}  // namespace shims
