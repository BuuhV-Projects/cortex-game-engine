#include "user_storage.h"

#include <SDL3/SDL.h>

#include <cstdio>
#include <string>

#include "../napi/napi_util.h"

namespace shims {
namespace {

// Pasta gravável do usuário (com separador no fim). Vazia se o host não
// conseguiu resolvê-la — aí as funções viram no-op (o JS cai pra memória).
std::string g_saveDir;

// A chave vem do JS (nome do arquivo do localStorage, ex.: "localStorage.json").
// Como é gravável, BARRA fuga da pasta: tira separadores, ':' e "..". Nunca
// vazio (fallback "store").
std::string safeName(const std::string& name) {
  std::string out;
  for (char c : name) {
    if (c == '/' || c == '\\' || c == ':') continue;  // sem componente de caminho
    if (c == '.' && !out.empty() && out.back() == '.') continue;  // colapsa ".."
    out += c;
  }
  return out.empty() ? "store" : out;
}

std::string filePath(const std::string& name) { return g_saveDir + safeName(name); }

napi_value jsReadUserFile(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  napi_value nullValue = nullptr;
  napi_get_null(env, &nullValue);
  if (argc < 1 || g_saveDir.empty()) return nullValue;

  std::string path = filePath(njs::toString(env, args[0]));
  FILE* file = std::fopen(path.c_str(), "rb");
  if (!file) return nullValue;  // ainda não salvou nada
  std::fseek(file, 0, SEEK_END);
  long size = std::ftell(file);
  std::fseek(file, 0, SEEK_SET);

  std::string buffer;
  if (size > 0) {
    buffer.resize(static_cast<size_t>(size));
    std::fread(&buffer[0], 1, static_cast<size_t>(size), file);
  }
  std::fclose(file);

  napi_value out = nullptr;
  napi_create_string_utf8(env, buffer.data(), buffer.size(), &out);
  return out;
}

napi_value jsWriteUserFile(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value args[2];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  napi_value falseValue = nullptr;
  napi_get_boolean(env, false, &falseValue);
  if (argc < 2 || g_saveDir.empty()) return falseValue;

  std::string path = filePath(njs::toString(env, args[0]));
  std::string data = njs::toString(env, args[1]);
  FILE* file = std::fopen(path.c_str(), "wb");
  if (!file) return falseValue;
  if (!data.empty()) std::fwrite(data.data(), 1, data.size(), file);
  std::fclose(file);

  napi_value trueValue = nullptr;
  napi_get_boolean(env, true, &trueValue);
  return trueValue;
}

}  // namespace

void registerUserStorage(napi_env env, const std::string& gameName) {
  // SDL_GetPrefPath cria e devolve <appdata-do-usuário>/<org>/<app>/ — usamos
  // org=jogo, app="saves" pra ficar <appdata>/<jogo>/saves/. Persistente e
  // separado por jogo; no console troca-se por XGameSave.
  char* pref = SDL_GetPrefPath(gameName.empty() ? "CortexNative" : gameName.c_str(), "saves");
  if (pref) {
    g_saveDir = pref;
    SDL_free(pref);
  }

  napi_value global = nullptr;
  napi_get_global(env, &global);
  njs::setMethod(env, global, "__cortexReadUserFile", jsReadUserFile);
  njs::setMethod(env, global, "__cortexWriteUserFile", jsWriteUserFile);
}

}  // namespace shims
