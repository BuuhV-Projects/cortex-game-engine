#include "timers.h"

#include <cstdint>
#include <vector>

#include "../napi/napi_util.h"

namespace shims {
namespace {

struct Timer {
  uint32_t id;
  napi_ref callback;
  double dueMs;
  // > 0 = REPETE a cada `intervalMs` (setInterval); 0 = dispara uma vez.
  double intervalMs;
};

// Piso do periodo do setInterval, em ms (o browser clampa em ~4).
constexpr double kMinIntervalMs = 1.0;

std::vector<Timer> g_timers;
uint32_t g_nextTimerId = 1;
double g_nowMs = 0;

uint32_t scheduleCallback(napi_env env, napi_value callback, double delayMs,
                          double intervalMs = 0) {
  napi_ref ref = nullptr;
  if (napi_create_reference(env, callback, 1, &ref) != napi_ok) return 0;
  uint32_t id = g_nextTimerId++;
  g_timers.push_back({id, ref, g_nowMs + delayMs, intervalMs});
  return id;
}

void cancelTimer(napi_env env, uint32_t id) {
  for (auto it = g_timers.begin(); it != g_timers.end(); ++it) {
    if (it->id != id) continue;
    napi_delete_reference(env, it->callback);
    g_timers.erase(it);
    return;
  }
}

std::vector<Timer> takeDueTimers(double nowMs) {
  std::vector<Timer> due;
  for (auto it = g_timers.begin(); it != g_timers.end();) {
    if (it->dueMs <= nowMs) {
      due.push_back(*it);
      it = g_timers.erase(it);
    } else {
      ++it;
    }
  }
  return due;
}

void fireTimer(napi_env env, const Timer& timer) {
  napi_value callback = nullptr;
  if (napi_get_reference_value(env, timer.callback, &callback) == napi_ok &&
      callback) {
    njs::callJsLogged(env, callback, 0, nullptr, "timer");
  }
  // Timer que REPETE mantem a referencia: quem a solta e o clearInterval (ou
  // o reagendamento que falha). Soltar aqui invalidaria a proxima disparada.
  if (timer.intervalMs <= 0) napi_delete_reference(env, timer.callback);
}

napi_value jsSetTimeout(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value args[2];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  double delay = 0;
  if (argc >= 2) napi_get_value_double(env, args[1], &delay);
  uint32_t id = argc >= 1 ? scheduleCallback(env, args[0], delay) : 0;
  napi_value out = nullptr;
  napi_create_uint32(env, id, &out);
  return out;
}

napi_value jsSetImmediate(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  uint32_t id = argc >= 1 ? scheduleCallback(env, args[0], 0) : 0;
  napi_value out = nullptr;
  napi_create_uint32(env, id, &out);
  return out;
}

// setInterval(fn, ms) — mesmo agendador, com periodo. Faltava no host, e a
// ponte do editor usa pra repetir o `hello` ate a IDE responder: a excecao
// ("Property 'setInterval' doesn't exist") subia do construtor do Game e
// derrubava o boot do jogo INTEIRO (SPEC-0204).
napi_value jsSetInterval(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value args[2];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  double delay = 0;
  if (argc >= 2) napi_get_value_double(env, args[1], &delay);
  // Periodo zero viraria trabalho infinito no mesmo frame: piso de 1 ms, como
  // o browser (que clampa em ~4 ms).
  const double period = delay > kMinIntervalMs ? delay : kMinIntervalMs;
  uint32_t id = argc >= 1 ? scheduleCallback(env, args[0], period, period) : 0;
  napi_value out = nullptr;
  napi_create_uint32(env, id, &out);
  return out;
}

napi_value jsClearTimeout(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  if (argc >= 1) {
    double id = 0;
    if (napi_get_value_double(env, args[0], &id) == napi_ok)
      cancelTimer(env, static_cast<uint32_t>(id));
  }
  return njs::undefined(env);
}

}  // namespace

void registerTimers(napi_env env) {
  napi_value global = nullptr;
  napi_get_global(env, &global);
  njs::setMethod(env, global, "setTimeout", jsSetTimeout);
  njs::setMethod(env, global, "clearTimeout", jsClearTimeout);
  njs::setMethod(env, global, "setImmediate", jsSetImmediate);
  njs::setMethod(env, global, "clearImmediate", jsClearTimeout);
  njs::setMethod(env, global, "setInterval", jsSetInterval);
  njs::setMethod(env, global, "clearInterval", jsClearTimeout);
}

void runTimers(napi_env env, double nowMs) {
  g_nowMs = nowMs;
  std::vector<Timer> due = takeDueTimers(nowMs);
  if (due.empty()) return;

  // Reagenda os que REPETEM **antes** de disparar: assim um `clearInterval`
  // chamado de dentro do proprio callback encontra o timer na lista e o
  // cancela. Reagendar depois deixaria o intervalo imortal.
  for (const Timer& timer : due) {
    if (timer.intervalMs > 0) {
      g_timers.push_back({timer.id, timer.callback, nowMs + timer.intervalMs, timer.intervalMs});
    }
  }

  napi_handle_scope scope = nullptr;
  napi_open_handle_scope(env, &scope);
  for (const Timer& timer : due) {
    // Cancelado pelo callback de um timer anterior nesta mesma rodada? Entao
    // nao dispara (o cancelTimer ja soltou a referencia).
    if (timer.intervalMs > 0) {
      bool alive = false;
      for (const Timer& t : g_timers) {
        if (t.id == timer.id) { alive = true; break; }
      }
      if (!alive) continue;
    }
    fireTimer(env, timer);
  }
  napi_close_handle_scope(env, scope);
}

}  // namespace shims
