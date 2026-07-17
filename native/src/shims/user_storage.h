// Persistência do usuário (saves): leitura/escrita de arquivos pequenos numa
// pasta GRAVÁVEL por-usuário do host (SDL_GetPrefPath → <appdata>/<jogo>/saves/).
// Distinto de files.cpp (assets do jogo, SÓ leitura): este é o ÚNICO caminho de
// ESCRITA exposto ao JS, e serve o shim de localStorage (js/src/shims/storage.js).
// No console isto vira XGameSave/armazenamento da plataforma — troca-se o backend
// mantendo a mesma API JS.
#pragma once

#include <node_api.h>

#include <string>

namespace shims {

// Registra no global:
//   __cortexReadUserFile(name)        → string (conteúdo) | null (ausente)
//   __cortexWriteUserFile(name, text) → boolean (gravou?)
// `gameName` nomeia a pasta de saves do usuário (ex.: "teste4").
void registerUserStorage(napi_env env, const std::string& gameName);

}  // namespace shims
