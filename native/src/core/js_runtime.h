// Runtime JavaScript do host — Hermes UPSTREAM (facebook/hermes) via o glue
// hermes_embed (ADR-0122; substituiu o fork Microsoft/jsr_* — ~4× mais rápido
// no mesmo bytecode). Responsabilidades: ciclo de vida do runtime, global
// print(), execução do boot (bytecode .hbc com fallback pra fonte .js) e drain
// de microtasks.
#pragma once

#include <node_api.h>

#include <string>

namespace core {

class JsRuntime {
 public:
  // Cria runtime + napi_env e registra print() no global.
  JsRuntime();
  ~JsRuntime();

  JsRuntime(const JsRuntime&) = delete;
  JsRuntime& operator=(const JsRuntime&) = delete;

  napi_env env() const { return env_; }

  // Executa `baseDir`/boot.hbc (bytecode) ou, na falta, boot.js (fonte).
  bool runBoot(const std::string& baseDir);

  // Esvazia a fila de microtasks (continuações de Promise/async).
  void drainMicrotasks();

  // RAII de napi_handle_scope. TODO acesso NAPI a partir do NATIVO (registro
  // de shims, args de timers/rAF, print) precisa de um scope aberto — criar
  // valores sem scope corrompe a pilha de scopes e o GC crasha na marcação
  // (o fork MS tolerava com o env-scope global; o upstream NÃO). O loop do
  // host abre UM por frame; boot/registro abrem o seu.
  class HandleScope {
   public:
    explicit HandleScope(napi_env env);
    ~HandleScope();
    HandleScope(const HandleScope&) = delete;
    HandleScope& operator=(const HandleScope&) = delete;

   private:
    napi_env env_;
    napi_handle_scope scope_ = nullptr;
  };

 private:
  bool runSourceFile(const std::string& path);

  void* runtime_ = nullptr;  // handle opaco do hermes_embed
  napi_env env_ = nullptr;
};

}  // namespace core
