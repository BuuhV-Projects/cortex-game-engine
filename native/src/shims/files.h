// Shim de arquivos: __cortexReadFile(path) → ArrayBuffer|null, lendo do
// diretório base do jogo (no PC: pasta do exe; no console: XPackage).
// O fetch() do JS (js/src/shims/net.js) é construído em cima disto.
#pragma once

#include <node_api.h>

#include <string>

namespace shims {

void registerFiles(napi_env env, const std::string& baseDir);

}  // namespace shims
