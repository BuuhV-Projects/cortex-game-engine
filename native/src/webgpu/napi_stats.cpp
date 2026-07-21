// Contadores de chamadas NAPI do caminho de render — ver napi_stats.h (SPEC-0134).
#include "napi_stats.h"

#include "../napi/napi_util.h"

namespace webgpu {

NapiFrameStats g_napiFrame;

namespace {

// Último frame COMPLETO. O HUD lê __cortexNapiStats() no meio de um frame (o
// corrente ainda está acumulando), então devolvemos sempre o frame anterior
// fechado — números estáveis, de um frame inteiro.
NapiFrameStats g_napiLast;

napi_value jsNapiStats(napi_env env, napi_callback_info) {
  napi_value out = nullptr;
  napi_create_object(env, &out);
  auto put = [&](const char* name, uint32_t value) {
    napi_value v = nullptr;
    napi_create_uint32(env, value, &v);
    napi_set_named_property(env, out, name, v);
  };
  put("setPipeline", g_napiLast.setPipeline);
  put("setBindGroup", g_napiLast.setBindGroup);
  put("setVertexBuffer", g_napiLast.setVertexBuffer);
  put("setIndexBuffer", g_napiLast.setIndexBuffer);
  put("draw", g_napiLast.draw);
  put("drawIndexed", g_napiLast.drawIndexed);
  put("writeBuffer", g_napiLast.writeBuffer);
  put("submit", g_napiLast.submit);
  return out;
}

}  // namespace

void resetNapiStatsFrame() {
  g_napiLast = g_napiFrame;
  g_napiFrame = NapiFrameStats{};
}

void registerNapiStats(napi_env env) {
  napi_value global = nullptr;
  napi_get_global(env, &global);
  njs::setMethod(env, global, "__cortexNapiStats", jsNapiStats);
}

}  // namespace webgpu
