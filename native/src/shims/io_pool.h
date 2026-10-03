// Pool de IO assíncrono (M-perf-3, PRD-0005). Roda trabalho pesado (ler
// assets do disco/pak, transcodar KTX2 — SPEC-0287) em threads de trabalho,
// fora da thread JS — pré-requisito do streaming de mundo-aberto (M-perf-4):
// carregar uma célula sem travar o frame.
//
// REGRA DE OURO: NENHUMA chamada NAPI fora da thread JS. Os workers só produzem
// bytes (std::vector); a criação do ArrayBuffer e a resolução da Promise
// acontecem no drain, na thread JS (chamado do runFrame).
#pragma once

#include <node_api.h>

#include <functional>
#include <string>

namespace shims {

// Trabalho do worker: SEM NAPI. Exceção é capturada e logada pelo pool; o
// `settle` roda mesmo assim (o estado capturado diz se deu certo).
using IoWork = std::function<void()>;
// Fechamento na thread JS (drain): resolve ou rejeita `deferred`.
using IoSettle = std::function<void(napi_env, napi_deferred)>;

// Enfileira `work` no pool e devolve a Promise que `settle` vai fechar.
// `label` só identifica a tarefa no error_log. Chamar na thread JS.
napi_value submitIoJob(napi_env env, std::string label, IoWork work,
                       IoSettle settle);

// Instala __cortexReadFileAsync(path) → Promise<ArrayBuffer|null> e inicia os
// workers. Chamar DEPOIS do registerFiles (os workers leem o pak/baseDir).
void registerFilesAsync(napi_env env);

// Drena as tarefas concluídas chamando o `settle` de cada uma. Chamar
// 1×/frame no runFrame, na thread JS.
void drainIoCompletions(napi_env env);

// Para os workers (join) — chamar ANTES do teardown do runtime Hermes.
void shutdownIoPool();

}  // namespace shims
