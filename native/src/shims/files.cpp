#include "files.h"

#include <cstdio>
#include <cstdlib>

#include "../napi/napi_util.h"

namespace shims {
namespace {

std::string g_baseDir;

// URL relativa → caminho no disco: normaliza barras, remove './', '/' do
// início e query string ('?...').
std::string resolvePath(const std::string& url) {
  std::string path = url;
  size_t query = path.find('?');
  if (query != std::string::npos) path.resize(query);
  while (path.rfind("./", 0) == 0) path.erase(0, 2);
  while (!path.empty() && path[0] == '/') path.erase(0, 1);
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

  std::string path = resolvePath(njs::toString(env, args[0]));
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

}  // namespace

void registerFiles(napi_env env, const std::string& baseDir) {
  g_baseDir = baseDir;
  napi_value global = nullptr;
  napi_get_global(env, &global);
  njs::setMethod(env, global, "__cortexReadFile", jsReadFile);
}

}  // namespace shims
