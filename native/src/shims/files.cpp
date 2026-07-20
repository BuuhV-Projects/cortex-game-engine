#include "files.h"

#include <cstdio>
#include <cstdlib>

#include "../napi/napi_util.h"
#include "pak.h"

namespace shims {
namespace {

std::string g_baseDir;

// URL relativa → chave normalizada (barras '/', sem query '?...', sem './' nem
// '/' no início). É a chave do pak E a base do caminho em disco.
std::string normalizeRel(const std::string& url) {
  std::string path = url;
  size_t query = path.find('?');
  if (query != std::string::npos) path.resize(query);
  while (path.rfind("./", 0) == 0) path.erase(0, 2);
  while (!path.empty() && path[0] == '/') path.erase(0, 1);
  for (char& c : path) {
    if (c == '\\') c = '/';
  }
  return path;
}

// chave relativa → caminho no disco (barras invertidas + base do jogo).
std::string diskPath(const std::string& rel) {
  std::string path = rel;
  for (char& c : path) {
    if (c == '/') c = '\\';
  }
  return g_baseDir + path;
}

napi_value jsReadFile(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  napi_value nullValue = nullptr;
  napi_get_null(env, &nullValue);
  if (argc < 1) return nullValue;

  const std::string rel = normalizeRel(njs::toString(env, args[0]));

  // 1) Tenta o container .pak (export). 2) Cai pro arquivo solto (dev/console).
  napi_value fromPak = readPakFile(env, rel);
  if (fromPak) return fromPak;

  std::string path = diskPath(rel);
  FILE* file = std::fopen(path.c_str(), "rb");
  if (!file) return nullValue;
  std::fseek(file, 0, SEEK_END);
  long size = std::ftell(file);
  std::fseek(file, 0, SEEK_SET);

  void* data = nullptr;
  napi_value arrayBuffer = nullptr;
  napi_create_arraybuffer(env, static_cast<size_t>(size), &data,
                          &arrayBuffer);
  if (data && size > 0) std::fread(data, 1, static_cast<size_t>(size), file);
  std::fclose(file);
  return arrayBuffer;
}

// Nome vindo do JS pra ESCRITA na pasta do jogo — barra fuga da pasta: tira
// separadores, ':' e colapsa "..". Só arquivo na raiz do dist-native (caso de
// uso: config.ini editável pelo usuário — SPEC-0124).
std::string safeBaseName(const std::string& name) {
  std::string out;
  for (char c : name) {
    if (c == '/' || c == '\\' || c == ':') continue;
    if (c == '.' && !out.empty() && out.back() == '.') continue;
    out += c;
  }
  return out;
}

// __cortexWriteBaseFile(name, text) → bool. Escrita de texto na pasta do jogo
// (ao lado do exe). Diferente do __cortexWriteUserFile (saves em pasta
// per-usuário), aqui é config compartilhada da instalação. Pode falhar se a
// pasta for read-only (ex.: Program Files) — o JS trata o false.
napi_value jsWriteBaseFile(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value args[2];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  napi_value falseValue = nullptr;
  napi_get_boolean(env, false, &falseValue);
  if (argc < 2 || g_baseDir.empty()) return falseValue;

  const std::string name = safeBaseName(njs::toString(env, args[0]));
  if (name.empty()) return falseValue;
  const std::string data = njs::toString(env, args[1]);
  FILE* file = std::fopen((g_baseDir + name).c_str(), "wb");
  if (!file) return falseValue;
  if (!data.empty()) std::fwrite(data.data(), 1, data.size(), file);
  std::fclose(file);

  napi_value trueValue = nullptr;
  napi_get_boolean(env, true, &trueValue);
  return trueValue;
}

}  // namespace

void registerFiles(napi_env env, const std::string& baseDir) {
  g_baseDir = baseDir;
  // Se houver assets.pak ao lado do exe, os assets vêm dele (export); senão o
  // host lê arquivos soltos do disco (dev). Transparente pro jogo.
  loadPak(baseDir + "assets.pak");
  napi_value global = nullptr;
  napi_get_global(env, &global);
  njs::setMethod(env, global, "__cortexReadFile", jsReadFile);
  njs::setMethod(env, global, "__cortexWriteBaseFile", jsWriteBaseFile);
}

}  // namespace shims
