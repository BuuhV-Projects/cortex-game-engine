// Ver clock.h (SPEC-0226).
#include "clock.h"

#include <chrono>

#include "../napi/napi_util.h"

namespace shims {

namespace {

// `steady_clock` e não `system_clock`: o relógio não pode andar para trás
// quando o sistema ajusta a hora.
using Relogio = std::chrono::steady_clock;

/** Origem: primeira consulta, que acontece no registro do shim (start). */
const Relogio::time_point& origem() {
  static const Relogio::time_point inicio = Relogio::now();
  return inicio;
}

napi_value jsNow(napi_env env, napi_callback_info) {
  const auto decorrido = Relogio::now() - origem();
  // Milissegundos como double, casando com a semântica do browser: quem já
  // usa `performance.now()` não muda nada, só passa a enxergar melhor.
  const double ms =
      std::chrono::duration<double, std::milli>(decorrido).count();
  napi_value out = nullptr;
  napi_create_double(env, ms, &out);
  return out;
}

}  // namespace

void registerClock(napi_env env) {
  origem();  // carimba o start antes da primeira leitura do JS
  napi_value global = nullptr;
  napi_get_global(env, &global);
  njs::setMethod(env, global, "__cortexNow", jsNow);
}

}  // namespace shims
