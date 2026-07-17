// Implementação do glue de embedding do Hermes upstream (ADR-0122). Compilado
// no alvo cortex_hermes_embed, que herda includes/defines do próprio build do
// Hermes (hermesNapi_obj) — ver native/CMakeLists.txt.
#include "hermes_embed.h"

#include <hermes_napi.h>

#include <hermes/Public/RuntimeConfig.h>
#include <hermes/VM/Runtime.h>
#include <llvh/Support/raw_ostream.h>

#include <cstdio>
#include <cstdlib>
#include <memory>

namespace {

using hermes::vm::Runtime;

// O shared_ptr precisa viver até o destroy — o handle opaco guarda ele.
struct RuntimeHolder {
  std::shared_ptr<Runtime> runtime;
};

Runtime* rt(void* handle) {
  return static_cast<RuntimeHolder*>(handle)->runtime.get();
}

// Loga a exceção pendente do VM no stderr (e limpa).
void logThrown(void* handle, const char* label) {
  Runtime& runtime = *rt(handle);
  hermes::vm::GCScope scope{runtime};
  std::fprintf(stderr, "[hermes] exceção em %s:\n", label);
  runtime.printException(llvh::errs(), runtime.makeHandle(runtime.getThrownValue()));
  runtime.clearThrownValue();
}

}  // namespace

extern "C" {

void* cortexHermesCreateRuntime() {
  auto config = hermes::vm::RuntimeConfig::Builder()
                    .withMicrotaskQueue(true)
                    .build();
  return new RuntimeHolder{Runtime::create(config)};
}

void cortexHermesDestroyRuntime(void* runtime) {
  delete static_cast<RuntimeHolder*>(runtime);
}

napi_env cortexHermesCreateEnv(void* runtime) {
  return hermes_napi_create_env(rt(runtime));
}

bool cortexHermesRunBytecode(void* runtime, napi_env env, uint8_t* data, size_t size, const char* url) {
  hermes_bytecode_flags flags{};
  flags.struct_size = sizeof(flags);
  flags.persistent = true;  // boot vive a sessão inteira: evita cópia do buffer
  napi_value result = nullptr;
  const napi_status status = hermes_run_bytecode(
      env, data, size,
      [](const uint8_t* d, size_t, void*) { std::free(const_cast<uint8_t*>(d)); },
      nullptr, url, &flags, &result);
  if (status != napi_ok) {
    logThrown(runtime, url);
    return false;
  }
  return true;
}

bool cortexHermesRunScript(void* runtime, napi_env env, const char* data, size_t size, const char* url) {
  napi_value result = nullptr;
  // Sem finalize_cb: o buffer é do chamador (o hermes copia se precisar do \0).
  const napi_status status = hermes_run_script(
      env, reinterpret_cast<const uint8_t*>(data), size, nullptr, nullptr, url, nullptr, &result);
  if (status != napi_ok) {
    logThrown(runtime, url);
    return false;
  }
  return true;
}

void cortexHermesDrainJobs(void* runtime) {
  Runtime& r = *rt(runtime);
  if (r.drainJobs() == hermes::vm::ExecutionStatus::EXCEPTION) {
    logThrown(runtime, "microtask");
  }
}

}  // extern "C"
