// IO assíncrono — ver io_pool.h (M-perf-3, PRD-0005; tarefa genérica SPEC-0287).
#include "io_pool.h"

#include <algorithm>
#include <atomic>
#include <condition_variable>
#include <cstring>
#include <memory>
#include <mutex>
#include <queue>
#include <thread>
#include <vector>

#include "../core/crash_handler.h"
#include "../napi/napi_util.h"
#include "files.h"
#include "perf_arraybuffer.h"

namespace shims {
namespace {

// O `deferred` é um ponteiro opaco: atravessa o worker sem ser usado lá.
struct Job {
  std::string label;
  IoWork work;
  IoSettle settle;
  napi_deferred deferred;
};

constexpr unsigned MIN_WORKERS = 2;
constexpr unsigned MAX_WORKERS = 4;

std::vector<std::thread> g_workers;
std::queue<Job> g_tasks;
std::mutex g_taskMx;
std::condition_variable g_taskCv;

std::queue<Job> g_done;
std::mutex g_doneMx;

std::atomic<bool> g_stop{false};

void runJobWork(Job& job) {
  // FRONTEIRA DE THREAD (ADR-0172): exceção que escapa do callable de uma
  // std::thread é std::terminate IMEDIATO — não passa por handler, não loga,
  // mata o jogo. E o que roda aqui aloca do tamanho do arquivo/textura,
  // durante o carregamento de fase.
  try {
    job.work();  // SEM NAPI (só bytes)
  } catch (...) {
    char desc[core::kExceptionDescMax];
    core::describeCurrentException(desc, sizeof(desc));
    core::appendErrorLog("[io] excecao C++ em %s: %s", job.label.c_str(), desc);
  }
}

void workerLoop() {
  // O handler de terminate do MSVC é POR THREAD: o instalado no main não vale
  // aqui (SPEC-0173). Sem isto, um escape derruba o jogo sem UMA linha de log.
  core::installThreadCrashHandler();
  for (;;) {
    Job job;
    {
      std::unique_lock<std::mutex> lk(g_taskMx);
      g_taskCv.wait(lk, [] { return g_stop.load() || !g_tasks.empty(); });
      if (g_stop.load() && g_tasks.empty()) return;
      job = std::move(g_tasks.front());
      g_tasks.pop();
    }
    runJobWork(job);
    try {
      std::lock_guard<std::mutex> lk(g_doneMx);
      g_done.push(std::move(job));
    } catch (...) {
      // Promise fica pendente (o JS espera pra sempre por ESTA tarefa), mas o
      // processo sobrevive — melhor que derrubar a sessão inteira.
      core::appendErrorLog("[io] falha ao enfileirar resultado de %s",
                           job.label.c_str());
    }
  }
}

// __cortexReadFileAsync(path) → Promise. A leitura vai pro pool; a Promise
// resolve no drain (runFrame) com o ArrayBuffer, ou `null` se o arquivo faltou.
napi_value jsReadFileAsync(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);

  if (argc < 1) {
    napi_deferred deferred = nullptr;
    napi_value promise = nullptr;
    napi_create_promise(env, &deferred, &promise);
    napi_value nul = nullptr;
    napi_get_null(env, &nul);
    napi_resolve_deferred(env, deferred, nul);
    return promise;
  }

  struct ReadState {
    std::string url;
    bool ok = false;  // exceção no worker = "arquivo ausente" pro JS
    std::vector<uint8_t> bytes;
  };
  auto state = std::make_shared<ReadState>();
  state->url = njs::toString(env, args[0]);
  return submitIoJob(
      env, state->url,
      [state] { state->ok = readAssetBytes(state->url, state->bytes); },
      [state](napi_env e, napi_deferred deferred) {
        napi_value value = nullptr;
        if (state->ok) {
          void* data = nullptr;
          napi_create_arraybuffer(e, state->bytes.size(), &data, &value);
          trackArrayBufferBytes(ArrayBufferSource::kIoPool, state->bytes.size());
          if (data && !state->bytes.empty())
            std::memcpy(data, state->bytes.data(), state->bytes.size());
        } else {
          napi_get_null(e, &value);
        }
        napi_resolve_deferred(e, deferred, value);
      });
}

}  // namespace

napi_value submitIoJob(napi_env env, std::string label, IoWork work,
                       IoSettle settle) {
  napi_deferred deferred = nullptr;
  napi_value promise = nullptr;
  napi_create_promise(env, &deferred, &promise);
  {
    std::lock_guard<std::mutex> lk(g_taskMx);
    g_tasks.push({std::move(label), std::move(work), std::move(settle), deferred});
  }
  g_taskCv.notify_one();
  return promise;
}

void drainIoCompletions(napi_env env) {
  std::queue<Job> local;
  {
    std::lock_guard<std::mutex> lk(g_doneMx);
    if (g_done.empty()) return;
    std::swap(local, g_done);
  }
  while (!local.empty()) {
    Job job = std::move(local.front());
    local.pop();
    job.settle(env, job.deferred);
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
