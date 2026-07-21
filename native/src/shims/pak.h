// Leitor do container de assets ".pak" (ADR-0104). O export empacota a pasta
// assets/ num arquivo único (native/scripts/pak.mjs); aqui o host lê dele.
// Barreira contra extração casual (não é criptografia — ver o .mjs).
#pragma once

#include <node_api.h>

#include <cstdint>
#include <string>
#include <vector>

namespace shims {

// Carrega o índice do .pak em memória. `true` se abriu e é válido (senão o host
// segue lendo arquivos soltos do disco — modo dev).
bool loadPak(const std::string& pakPath);

// Lê um arquivo do pak pela chave relativa (ex.: "assets/kit/bee.glb"), já
// desembaralhado. Devolve o ArrayBuffer, ou `nullptr` se a chave não está no
// pak (o chamador cai pro disco).
napi_value readPakFile(napi_env env, const std::string& relPath);

// Lê os bytes de um arquivo do pak (desembaralhados), SEM NAPI — chamável de
// qualquer thread (fopen próprio por chamada; o índice é read-only após o boot).
// `false` se a chave não está no pak. Base da leitura assíncrona (M-perf-3).
bool readPakBytes(const std::string& relPath, std::vector<uint8_t>& out);

}  // namespace shims
