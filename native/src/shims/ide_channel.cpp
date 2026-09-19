#include "ide_channel.h"

#include <SDL3/SDL.h>

#include <atomic>
#include <cstdio>
#include <deque>
#include <iostream>
#include <mutex>
#include <string>
#include <thread>

#include "../napi/napi_util.h"

namespace shims {
namespace {

// Fila de linhas recebidas do stdin, preenchida pela thread de leitura e
// drenada na thread JS. A thread de leitura só produz bytes — nenhuma chamada
// NAPI fora da thread JS (mesma regra do io_pool, M-perf-3).
std::mutex g_mutex;
std::deque<std::string> g_inbox;
std::atomic<bool> g_running{false};
std::thread g_reader;

// Callback JS que recebe cada linha (napi_ref pra sobreviver ao escopo).
napi_ref g_onMessage = nullptr;

// Máximo de linhas acumuladas sem drenagem — protege contra um produtor
// descontrolado enquanto o jogo carrega (o drain só roda a partir do 1º frame).
constexpr size_t kMaxInbox = 4096;

void readerLoop() {
  std::string line;
  while (g_running.load(std::memory_order_relaxed) && std::getline(std::cin, line)) {
    if (line.empty()) continue;
    std::lock_guard<std::mutex> lock(g_mutex);
    if (g_inbox.size() >= kMaxInbox) g_inbox.pop_front();  // descarta o mais velho
    g_inbox.push_back(line);
  }
}

// __cortexIdeSend(linha) → stdout, prefixado, com flush (a IDE lê na hora).
napi_value jsSend(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1] = {nullptr};
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  if (argc >= 1 && argv[0] != nullptr) {
    const std::string line = njs::toString(env, argv[0]);
    std::fprintf(stdout, "%s%s\n", kIdeChannelPrefix, line.c_str());
    std::fflush(stdout);
  }
  return nullptr;
}

// __cortexIdeOnMessage(fn) → guarda o callback.
napi_value jsOnMessage(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1] = {nullptr};
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  if (argc >= 1 && argv[0] != nullptr) {
    if (g_onMessage) napi_delete_reference(env, g_onMessage);
    napi_create_reference(env, argv[0], 1, &g_onMessage);
  }
  return nullptr;
}

}  // namespace

void registerIdeChannel(napi_env env) {
  if (SDL_getenv("CORTEX_IDE_CHANNEL") == nullptr) return;  // gate

  napi_value global = nullptr;
  napi_get_global(env, &global);
  njs::setMethod(env, global, "__cortexIdeSend", jsSend);
  njs::setMethod(env, global, "__cortexIdeOnMessage", jsOnMessage);
  napi_value flag = nullptr;
  napi_get_boolean(env, true, &flag);
  napi_set_named_property(env, global, "__cortexIdeChannel", flag);

  g_running.store(true, std::memory_order_relaxed);
  g_reader = std::thread(readerLoop);
}

void drainIdeMessages(napi_env env) {
  if (!g_onMessage) return;
  std::deque<std::string> batch;
  {
    std::lock_guard<std::mutex> lock(g_mutex);
    if (g_inbox.empty()) return;
    batch.swap(g_inbox);
  }
  napi_value callback = nullptr;
  if (napi_get_reference_value(env, g_onMessage, &callback) != napi_ok || !callback) return;
  napi_value global = nullptr;
  napi_get_global(env, &global);
  for (const std::string& line : batch) {
    napi_value arg = nullptr;
    if (napi_create_string_utf8(env, line.c_str(), line.size(), &arg) != napi_ok) continue;
    napi_value result = nullptr;
    // Uma linha malformada não pode derrubar o host: limpa a exceção e segue.
    if (napi_call_function(env, global, callback, 1, &arg, &result) != napi_ok) {
      bool pending = false;
      napi_is_exception_pending(env, &pending);
      if (pending) {
        napi_value error = nullptr;
        napi_get_and_clear_last_exception(env, &error);
      }
    }
  }
}

void stopIdeChannel() {
  if (!g_running.exchange(false)) return;
  // `getline` fica bloqueado até o stdin fechar; detach evita travar o
  // shutdown esperando uma leitura que pode nunca chegar.
  if (g_reader.joinable()) g_reader.detach();
}

}  // namespace shims
