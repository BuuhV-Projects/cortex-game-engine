#include "napi_util.h"

#include <cstdio>

namespace njs {

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
  std::fprintf(stderr, "[%s] exceção JS: %.*s\n", where,
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

void setMethod(napi_env env, napi_value obj, const char* name,
               napi_callback cb) {
  napi_value fn = nullptr;
  napi_create_function(env, name, NAPI_AUTO_LENGTH, cb, nullptr, &fn);
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
