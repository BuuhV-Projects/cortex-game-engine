#include "js_runtime.h"

#include <cstdio>
#include <cstdlib>

#include "../napi/napi_util.h"
#include "hermes_embed.h"

namespace core {
namespace {

// Handle do runtime pro __cortexGC (um runtime por processo — o callback NAPI
// não carrega estado, então o handle vive aqui). ADR-0153.
void* g_runtimeForGc = nullptr;

// __cortexGC() — coleta de lixo completa sob demanda. O engine chama no
// Game.reset(): finalizers dos wrappers de GPU rodam → wgpu*Release → a VRAM
// da fase anterior volta na troca (e não "quando o GC quiser"). ADR-0153.
napi_value jsCollectGarbage(napi_env env, napi_callback_info) {
  if (g_runtimeForGc) cortexHermesCollectGarbage(g_runtimeForGc);
  return njs::undefined(env);
}

// __cortexHeapSnapshot(path) — telemetria temporária (SPEC-0152).
napi_value jsHeapSnapshot(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  if (argc >= 1 && g_runtimeForGc) {
    const std::string path = njs::toString(env, args[0]);
    std::printf("[gc] heap snapshot -> %s\n", path.c_str());
    std::fflush(stdout);
    cortexHermesHeapSnapshot(g_runtimeForGc, path.c_str());
  }
  return njs::undefined(env);
}

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

JsRuntime::HandleScope::HandleScope(napi_env env) : env_(env) {
  napi_open_handle_scope(env_, &scope_);
}

JsRuntime::HandleScope::~HandleScope() {
  if (scope_) napi_close_handle_scope(env_, scope_);
}

JsRuntime::JsRuntime() {
  runtime_ = cortexHermesCreateRuntime();
  env_ = cortexHermesCreateEnv(runtime_);

  HandleScope scope{env_};
  napi_value global = nullptr;
  napi_get_global(env_, &global);
  njs::setMethod(env_, global, "print", jsPrint);
  g_runtimeForGc = runtime_;
  njs::setMethod(env_, global, "__cortexGC", jsCollectGarbage);
  njs::setMethod(env_, global, "__cortexHeapSnapshot", jsHeapSnapshot);
}

JsRuntime::~JsRuntime() {
  // O runtime é dono do env (hermes_napi): destruir o runtime derruba o env.
  cortexHermesDestroyRuntime(runtime_);
}

bool JsRuntime::runBoot(const std::string& baseDir) {
  HandleScope scope{env_};
  size_t size = 0;
  if (uint8_t* data = readFile(baseDir + "boot.hbc", &size)) {
    // O hermes toma posse de `data` (libera quando não precisar mais).
    if (!cortexHermesRunBytecode(runtime_, env_, data, size, "boot.hbc")) return false;
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

bool JsRuntime::runSourceFile(const std::string& path) {
  size_t size = 0;
  uint8_t* data = readFile(path, &size);
  if (!data) return false;
  const bool ok = cortexHermesRunScript(
      runtime_, env_, reinterpret_cast<char*>(data), size, "boot.js");
  std::free(data);
  return ok;
}

void JsRuntime::drainMicrotasks() {
  cortexHermesDrainJobs(runtime_);
}

double JsRuntime::heapUsedMB() const {
  return cortexHermesHeapUsedMB(runtime_);
}

double JsRuntime::externalBytesMB() const {
  return cortexHermesExternalBytesMB(runtime_);
}

}  // namespace core
