#include "napi_util.h"

#include "../core/crash_handler.h"

#include <cstdio>
#include <deque>
#include <string>

namespace njs {
namespace {

// Binding registrado: o callback REAL + o nome, pro log nomear o culpado. Vive
// a sessão inteira (o deque dá endereço estável e nunca é esvaziado) — são
// dezenas de entradas criadas no boot, não há churn.
struct Binding {
  napi_callback callback;
  std::string name;
};

std::deque<Binding> g_bindings;

// Trampolim de TODO binding do host (ADR-0172). Exceção C++ que atravessasse a
// fronteira nativa→JS não tinha quem capturasse: virava std::terminate e o jogo
// fechava sem log. Aqui ela vira erro JS normal — o jogo segue vivo e a causa
// fica escrita no error_log.txt.
napi_value guardedCall(napi_env env, napi_callback_info info) {
  void* data = nullptr;
  napi_get_cb_info(env, info, nullptr, nullptr, nullptr, &data);
  const auto* binding = static_cast<const Binding*>(data);
  if (!binding || !binding->callback) return undefined(env);
  try {
    // Repassa o MESMO callback_info: argc, args, `this` e unwrapThis seguem
    // funcionando sem que nenhum binding precise mudar.
    return binding->callback(env, info);
  } catch (...) {
    char desc[core::kExceptionDescMax];
    core::describeCurrentException(desc, sizeof(desc));
    core::appendErrorLog("[napi] excecao C++ em %s: %s", binding->name.c_str(),
                         desc);
    napi_throw_error(env, nullptr, desc);
    return undefined(env);
  }
}

}  // namespace

napi_value undefined(napi_env env) {
  napi_value v = nullptr;
  napi_get_undefined(env, &v);
  return v;
}

void throwError(napi_env env, const char* message) {
  napi_throw_error(env, nullptr, message);
}

void logPendingException(napi_env env, const char* where) {
  bool pending = false;
  napi_is_exception_pending(env, &pending);
  if (!pending) return;
  napi_value exception = nullptr;
  napi_get_and_clear_last_exception(env, &exception);

  // Preferir .stack (mensagem + stack trace); cair pra coerção em string.
  napi_value stack = nullptr;
  napi_value asString = nullptr;
  bool hasStack = false;
  if (napi_get_named_property(env, exception, "stack", &stack) == napi_ok) {
    napi_valuetype type = napi_undefined;
    napi_typeof(env, stack, &type);
    hasStack = type == napi_string;
  }
  if (napi_coerce_to_string(env, hasStack ? stack : exception, &asString) !=
      napi_ok)
    return;
  char buffer[4096];
  size_t length = 0;
  napi_get_value_string_utf8(env, asString, buffer, sizeof(buffer), &length);
  // stderr + error_log.txt (num exe sem console, e o unico rastro da excecao).
  core::appendErrorLog("[%s] excecao JS: %.*s", where,
               static_cast<int>(length), buffer);
}

void callJsLogged(napi_env env, napi_value callback, size_t argc,
                  const napi_value* argv, const char* where) {
  napi_value global = nullptr;
  napi_get_global(env, &global);
  napi_value result = nullptr;
  if (napi_call_function(env, global, callback, argc, argv, &result) !=
      napi_ok) {
    logPendingException(env, where);
  }
}

std::string toString(napi_env env, napi_value value) {
  napi_value asString = nullptr;
  if (napi_coerce_to_string(env, value, &asString) != napi_ok) return {};
  size_t length = 0;
  napi_get_value_string_utf8(env, asString, nullptr, 0, &length);
  std::string out(length, '\0');
  napi_get_value_string_utf8(env, asString, out.data(), length + 1, &length);
  return out;
}

bool getNamed(napi_env env, napi_value obj, const char* name,
              napi_value* out) {
  bool has = false;
  if (napi_has_named_property(env, obj, name, &has) != napi_ok || !has)
    return false;
  if (napi_get_named_property(env, obj, name, out) != napi_ok) return false;
  napi_valuetype type = napi_undefined;
  napi_typeof(env, *out, &type);
  return type != napi_undefined && type != napi_null;
}

std::string getNamedString(napi_env env, napi_value obj, const char* name,
                           const char* fallback) {
  napi_value v = nullptr;
  if (!getNamed(env, obj, name, &v)) return fallback;
  return toString(env, v);
}

double getNamedNumber(napi_env env, napi_value obj, const char* name,
                      double fallback) {
  napi_value v = nullptr;
  if (!getNamed(env, obj, name, &v)) return fallback;
  double out = fallback;
  napi_get_value_double(env, v, &out);
  return out;
}

bool getNamedBool(napi_env env, napi_value obj, const char* name,
                  bool fallback) {
  napi_value v = nullptr;
  if (!getNamed(env, obj, name, &v)) return fallback;
  napi_value coerced = nullptr;
  if (napi_coerce_to_bool(env, v, &coerced) != napi_ok) return fallback;
  bool out = fallback;
  napi_get_value_bool(env, coerced, &out);
  return out;
}

napi_value makeObject(napi_env env) {
  napi_value obj = nullptr;
  napi_create_object(env, &obj);
  return obj;
}

// Funil ÚNICO de registro de binding do host — é a única chamada de
// napi_create_function do projeto. Por isso o try/catch mora aqui (guardedCall)
// em vez de espalhado por dezenas de callbacks: binding novo nasce blindado,
// sem depender de ninguém lembrar (ADR-0172).
void setMethod(napi_env env, napi_value obj, const char* name,
               napi_callback cb) {
  g_bindings.push_back({cb, name ? name : "?"});
  napi_value fn = nullptr;
  napi_create_function(env, name, NAPI_AUTO_LENGTH, guardedCall,
                       &g_bindings.back(), &fn);
  napi_set_named_property(env, obj, name, fn);
}

napi_value wrapHandle(napi_env env, void* handle, napi_finalize finalizer) {
  napi_value obj = makeObject(env);
  napi_wrap(env, obj, handle, finalizer, nullptr, nullptr);
  return obj;
}

void finalizeNoop(napi_env, void*, void*) {}

void* unwrapThis(napi_env env, napi_callback_info info, size_t* argc,
                 napi_value* args) {
  napi_value self = nullptr;
  napi_get_cb_info(env, info, argc, args, &self, nullptr);
  void* handle = nullptr;
  napi_unwrap(env, self, &handle);
  return handle;
}

void* unwrapValue(napi_env env, napi_value obj) {
  void* handle = nullptr;
  napi_unwrap(env, obj, &handle);
  return handle;
}

napi_value resolvedPromise(napi_env env, napi_value value) {
  napi_deferred deferred = nullptr;
  napi_value promise = nullptr;
  napi_create_promise(env, &deferred, &promise);
  napi_resolve_deferred(env, deferred, value);
  return promise;
}

}  // namespace njs
