// Shim de arquivos: __cortexReadFile(path) → ArrayBuffer|null, lendo do
// diretório base do jogo (no PC: pasta do exe; no console: XPackage).
// O fetch() do JS (js/src/shims/net.js) é construído em cima disto.
#pragma once

#include <node_api.h>

#include <cstdint>
#include <string>
#include <vector>

namespace shims {

void registerFiles(napi_env env, const std::string& baseDir);

// Lê os bytes de um asset (pak XOR ou arquivo solto), SEM NAPI — chamável de
// qualquer thread (o pak/baseDir são read-only após o boot). `false` se não
// existe. Base da leitura assíncrona do io_pool (M-perf-3).
bool readAssetBytes(const std::string& url, std::vector<uint8_t>& out);

}  // namespace shims
