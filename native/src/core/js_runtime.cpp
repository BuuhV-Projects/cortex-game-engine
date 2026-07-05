#include "js_runtime.h"

#include <cstdio>
#include <cstdlib>

#include "../napi/napi_util.h"

namespace core {
namespace {

// print(...args) — instrumentação básica do runtime JS.
napi_value jsPrint(napi_env env, napi_callback_info info) {
  size_t argc = 8;
  napi_value args[8];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  for (size_t i = 0; i < argc; ++i) {
    std::string text = njs::toString(env, args[i]);
    std::printf("%s%s", i ? " " : "[js] ", text.c_str());
  }
  std::printf("\n");
  std::fflush(stdout);
  return njs::undefined(env);
}

// Lê um arquivo binário inteiro (malloc — ownership pode ir pro Hermes).
uint8_t* readFile(const std::string& path, size_t* outSize) {
  FILE* file = std::fopen(path.c_str(), "rb");
  if (!file) return nullptr;
  std::fseek(file, 0, SEEK_END);
  long size = std::ftell(file);
  std::fseek(file, 0, SEEK_SET);
  auto* data = static_cast<uint8_t*>(std::malloc(static_cast<size_t>(size)));
  if (data) std::fread(data, 1, static_cast<size_t>(size), file);
  std::fclose(file);
  *outSize = static_cast<size_t>(size);
  return data;
}

}  // namespace

JsRuntime::JsRuntime() {
  jsr_config config = nullptr;
  jsr_create_config(&config);
  jsr_create_runtime(config, &runtime_);
  jsr_delete_config(config);
  jsr_runtime_get_node_api_env(runtime_, &env_);
  jsr_open_napi_env_scope(env_, &scope_);

  napi_value global = nullptr;
  napi_get_global(env_, &global);
  njs::setMethod(env_, global, "print", jsPrint);
}

JsRuntime::~JsRuntime() {
  jsr_close_napi_env_scope(env_, scope_);
  jsr_delete_runtime(runtime_);
}

bool JsRuntime::runBoot(const std::string& baseDir) {
  size_t size = 0;
  if (uint8_t* data = readFile(baseDir + "boot.hbc", &size)) {
    if (!runPreparedBytecode(data, size)) return false;
    std::printf("boot: bytecode boot.hbc executado\n");
    return true;
  }
  if (runSourceFile(baseDir + "boot.js")) {
    std::printf("boot: fonte boot.js executada (sem .hbc)\n");
    return true;
  }
  std::fprintf(stderr, "boot: nem boot.hbc nem boot.js encontrados em %s\n",
               baseDir.c_str());
  return false;
}

bool JsRuntime::runPreparedBytecode(uint8_t* data, size_t size) {
  jsr_prepared_script prepared = nullptr;
  napi_status status = jsr_create_prepared_script(
      env_, data, size, [](void* d, void*) { std::free(d); }, nullptr,
      "boot.hbc", &prepared);
  if (status != napi_ok) {
    njs::logPendingException(env_, "prepare boot.hbc");
    return false;
  }
  napi_value result = nullptr;
  status = jsr_prepared_script_run(env_, prepared, &result);
  jsr_delete_prepared_script(env_, prepared);
  if (status != napi_ok) {
    njs::logPendingException(env_, "run boot.hbc");
    return false;
  }
  return true;
}

bool JsRuntime::runSourceFile(const std::string& path) {
  size_t size = 0;
  uint8_t* data = readFile(path, &size);
  if (!data) return false;
  napi_value source = nullptr;
  napi_create_string_utf8(env_, reinterpret_cast<char*>(data), size, &source);
  std::free(data);
  napi_value result = nullptr;
  if (jsr_run_script(env_, source, "boot.js", &result) != napi_ok) {
    njs::logPendingException(env_, "run boot.js");
    return false;
  }
  return true;
}

void JsRuntime::drainMicrotasks() {
  bool hasMore = false;
  jsr_drain_microtasks(env_, -1, &hasMore);
}

}  // namespace core
