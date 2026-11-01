#include "decompression.h"

#include <cstring>
#include <string>

#include "../napi/napi_util.h"
#include "inflate.h"
#include "perf_arraybuffer.h"

namespace shims {
namespace {

// Aceita ArrayBuffer ou Uint8Array (o que o streams.js entrega).
bool getBytes(napi_env env, napi_value value, void** data, size_t* size) {
  bool isTypedArray = false;
  napi_is_typedarray(env, value, &isTypedArray);
  if (isTypedArray) {
    napi_typedarray_type type;
    napi_value arrayBuffer = nullptr;
    size_t byteOffset = 0;
    napi_get_typedarray_info(env, value, &type, size, data, &arrayBuffer,
                             &byteOffset);
    return type == napi_uint8_array;
  }
  bool isArrayBuffer = false;
  napi_is_arraybuffer(env, value, &isArrayBuffer);
  return isArrayBuffer &&
         napi_get_arraybuffer_info(env, value, data, size) == napi_ok;
}

napi_value jsInflate(napi_env env, napi_callback_info info) {
  constexpr size_t kArgs = 2;
  size_t argc = kArgs;
  napi_value args[kArgs];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  napi_value nullValue = nullptr;
  napi_get_null(env, &nullValue);
  if (argc < kArgs) return nullValue;

  void* bytes = nullptr;
  size_t size = 0;
  const std::optional<InflateFormat> format =
      parseInflateFormat(njs::toString(env, args[1]));
  if (!format || !getBytes(env, args[0], &bytes, &size)) return nullValue;

  std::optional<std::vector<uint8_t>> out =
      inflateBytes(static_cast<const uint8_t*>(bytes), size, *format);
  if (!out) return nullValue;

  void* dst = nullptr;
  napi_value result = nullptr;
  napi_create_arraybuffer(env, out->size(), &dst, &result);
  trackArrayBufferBytes(ArrayBufferSource::kInflate, out->size());
  if (!out->empty()) std::memcpy(dst, out->data(), out->size());
  return result;
}

}  // namespace

void registerDecompression(napi_env env) {
  napi_value global = nullptr;
  napi_get_global(env, &global);
  njs::setMethod(env, global, "__cortexInflate", jsInflate);
}

}  // namespace shims
