// Runtime JavaScript do host (Hermes via API C do fork Microsoft).
// Responsabilidades: ciclo de vida do runtime, global print(), execução do
// boot (bytecode .hbc com fallback pra fonte .js) e drain de microtasks.
#pragma once

#include <hermes/hermes_api.h>

#include <string>

namespace core {

class JsRuntime {
 public:
  // Cria runtime + abre o escopo Node-API e registra print() no global.
  JsRuntime();
  ~JsRuntime();

  JsRuntime(const JsRuntime&) = delete;
  JsRuntime& operator=(const JsRuntime&) = delete;

  napi_env env() const { return env_; }

  // Executa `baseDir`/boot.hbc (bytecode) ou, na falta, boot.js (fonte).
  bool runBoot(const std::string& baseDir);

  // Esvazia a fila de microtasks (continuações de Promise/async).
  void drainMicrotasks();

 private:
  bool runPreparedBytecode(uint8_t* data, size_t size);
  bool runSourceFile(const std::string& path);

  jsr_runtime runtime_ = nullptr;
  jsr_napi_env_scope scope_ = nullptr;
  napi_env env_ = nullptr;
};

}  // namespace core
