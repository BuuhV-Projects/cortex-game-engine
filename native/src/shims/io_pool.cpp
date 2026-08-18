// IO assíncrono — ver io_pool.h (M-perf-3, PRD-0005).
#include "io_pool.h"

#include <algorithm>
#include <atomic>
#include <condition_variable>
#include <cstring>
#include <mutex>
#include <queue>
#include <thread>
#include <unordered_map>
#include <vector>

#include "../core/crash_handler.h"
#include "../napi/napi_util.h"
#include "files.h"
#include "perf_arraybuffer.h"

namespace shims {
namespace {

struct Task {
  uint64_t id;
  std::string url;
};

struct Done {
  uint64_t id;
  bool ok;
  std::vector<uint8_t> bytes;
};

constexpr unsigned MIN_WORKERS = 2;
constexpr unsigned MAX_WORKERS = 4;

std::vector<std::thread> g_workers;
std::queue<Task> g_tasks;
std::mutex g_taskMx;
std::condition_variable g_taskCv;

std::queue<Done> g_done;
std::mutex g_doneMx;

std::atomic<bool> g_stop{false};
std::atomic<uint64_t> g_nextId{1};

// Promises pendentes por id. SÓ a thread JS toca (jsReadFileAsync + drain) —
// sem lock. Os workers nunca veem isto (regra de ouro).
std::unordered_map<uint64_t, napi_deferred> g_pending;

void workerLoop() {
  // O handler de terminate do MSVC é POR THREAD: o instalado no main não vale
  // aqui (SPEC-0173). Sem isto, um escape derruba o jogo sem UMA linha de log.
  core::installThreadCrashHandler();
  for (;;) {
    Task task;
    {
      std::unique_lock<std::mutex> lk(g_taskMx);
      g_taskCv.wait(lk, [] { return g_stop.load() || !g_tasks.empty(); });
      if (g_stop.load() && g_tasks.empty()) return;
      task = std::move(g_tasks.front());
      g_tasks.pop();
    }
    // FRONTEIRA DE THREAD (ADR-0172): exceção que escapa do callable de uma
    // std::thread é std::terminate IMEDIATO — não passa por handler, não loga,
    // mata o jogo. E o que roda aqui aloca do tamanho do arquivo
    // (`vector::resize` em files.cpp/pak.cpp), durante o carregamento de fase.
    Done done;
    done.id = task.id;
    try {
      done.ok = readAssetBytes(task.url, done.bytes);  // SEM NAPI (só bytes)
    } catch (...) {
      char desc[core::kExceptionDescMax];
      core::describeCurrentException(desc, sizeof(desc));
      core::appendErrorLog("[io] excecao C++ lendo %s: %s", task.url.c_str(),
                           desc);
      done.ok = false;  // o JS já trata como "arquivo ausente"
      done.bytes.clear();
    }
    try {
      std::lock_guard<std::mutex> lk(g_doneMx);
      g_done.push(std::move(done));
    } catch (...) {
      // Promise fica pendente (o JS espera pra sempre por ESTE asset), mas o
      // processo sobrevive — melhor que derrubar a sessão inteira.
      core::appendErrorLog("[io] falha ao enfileirar resultado de %s",
                           task.url.c_str());
    }
  }
}

// __cortexReadFileAsync(path) → Promise. A leitura vai pro pool; a Promise
// resolve no drain (runFrame) com o ArrayBuffer, ou `null` se o arquivo faltou.
napi_value jsReadFileAsync(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);

  napi_deferred deferred = nullptr;
  napi_value promise = nullptr;
  napi_create_promise(env, &deferred, &promise);

  if (argc < 1) {
    napi_value nul = nullptr;
    napi_get_null(env, &nul);
    napi_resolve_deferred(env, deferred, nul);
    return promise;
  }

  const uint64_t id = g_nextId.fetch_add(1);
  g_pending[id] = deferred;
  {
    std::lock_guard<std::mutex> lk(g_taskMx);
    g_tasks.push({id, njs::toString(env, args[0])});
  }
  g_taskCv.notify_one();
  return promise;
}

}  // namespace

void drainIoCompletions(napi_env env) {
  std::queue<Done> local;
  {
    std::lock_guard<std::mutex> lk(g_doneMx);
    if (g_done.empty()) return;
    std::swap(local, g_done);
  }
  while (!local.empty()) {
    Done done = std::move(local.front());
    local.pop();
    auto it = g_pending.find(done.id);
    if (it == g_pending.end()) continue;  // não deveria acontecer
    napi_deferred deferred = it->second;
    g_pending.erase(it);

    napi_value value = nullptr;
    if (done.ok) {
      void* data = nullptr;
      napi_create_arraybuffer(env, done.bytes.size(), &data, &value);
      trackArrayBufferBytes(ArrayBufferSource::kIoPool, done.bytes.size());
      if (data && !done.bytes.empty())
        std::memcpy(data, done.bytes.data(), done.bytes.size());
    } else {
      napi_get_null(env, &value);
    }
    napi_resolve_deferred(env, deferred, value);
  }
}

void registerFilesAsync(napi_env env) {
  const unsigned hw = std::thread::hardware_concurrency();
  const unsigned n = std::clamp(hw ? hw : MIN_WORKERS, MIN_WORKERS, MAX_WORKERS);
  for (unsigned i = 0; i < n; ++i) g_workers.emplace_back(workerLoop);

  napi_value global = nullptr;
  napi_get_global(env, &global);
  njs::setMethod(env, global, "__cortexReadFileAsync", jsReadFileAsync);
}

void shutdownIoPool() {
  g_stop.store(true);
  g_taskCv.notify_all();
  for (auto& t : g_workers) {
    if (t.joinable()) t.join();
  }
  g_workers.clear();
  // Promises pendentes ficam sem resolver — o runtime está sendo desligado, os
  // objetos JS serão coletados no teardown. Não tocar NAPI aqui.
}

}  // namespace shims
