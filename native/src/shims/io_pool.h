// Pool de IO assíncrono (M-perf-3, PRD-0005). Lê assets do disco/pak em threads
// de trabalho, fora da thread JS — pré-requisito do streaming de mundo-aberto
// (M-perf-4): carregar uma célula sem travar o frame.
//
// REGRA DE OURO: NENHUMA chamada NAPI fora da thread JS. Os workers só produzem
// bytes (std::vector); a criação do ArrayBuffer e a resolução da Promise
// acontecem no drain, na thread JS (chamado do runFrame).
#pragma once

#include <node_api.h>

namespace shims {

// Instala __cortexReadFileAsync(path) → Promise<ArrayBuffer|null> e inicia os
// workers. Chamar DEPOIS do registerFiles (os workers leem o pak/baseDir).
void registerFilesAsync(napi_env env);

// Drena as leituras concluídas: cria o ArrayBuffer e resolve a Promise. Chamar
// 1×/frame no runFrame, na thread JS.
void drainIoCompletions(napi_env env);

// Para os workers (join) — chamar ANTES do teardown do runtime Hermes.
void shutdownIoPool();

}  // namespace shims
