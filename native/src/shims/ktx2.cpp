#include "ktx2.h"

#include <cstdint>
#include <cstring>
#include <memory>
#include <vector>

#include "../napi/napi_util.h"
#include "io_pool.h"
#include "ktx2_transcode.h"
#include "perf_arraybuffer.h"

namespace shims {
namespace {

// Aceita ArrayBuffer ou Uint8Array com os bytes do .ktx2 (igual ao image_decode).
bool getSourceBytes(napi_env env, napi_value value, void** data, size_t* size) {
  bool isTypedArray = false;
  napi_is_typedarray(env, value, &isTypedArray);
  if (isTypedArray) {
    napi_typedarray_type type;
    size_t length = 0;
    napi_value arrayBuffer = nullptr;
    size_t byteOffset = 0;
    napi_get_typedarray_info(env, value, &type, &length, data, &arrayBuffer, &byteOffset);
    *size = length;  // bytes só se Uint8Array
    return type == napi_uint8_array;
  }
  bool isArrayBuffer = false;
  napi_is_arraybuffer(env, value, &isArrayBuffer);
  if (isArrayBuffer)
    return napi_get_arraybuffer_info(env, value, data, size) == napi_ok;
  return false;
}

// Copia um vetor pra um ArrayBuffer novo (thread JS), contando na fonte ktx2.
napi_value makeArrayBuffer(napi_env env, const std::vector<uint8_t>& bytes) {
  void* out = nullptr;
  napi_value buf = nullptr;
  napi_create_arraybuffer(env, bytes.size(), &out, &buf);
  trackArrayBufferBytes(ArrayBufferSource::kKtx2, bytes.size());
  if (out && !bytes.empty()) std::memcpy(out, bytes.data(), bytes.size());
  return buf;
}

void setString(napi_env env, napi_value obj, const char* key, const char* value) {
  napi_value str = nullptr;
  napi_create_string_utf8(env, value, NAPI_AUTO_LENGTH, &str);
  napi_set_named_property(env, obj, key, str);
}

// `{ width, height, format:'bc7', levels }` | `{ width, height, format:'rgba', rgba }`.
napi_value toJsResult(napi_env env, const Ktx2Image& image) {
  napi_value result = njs::makeObject(env);
  napi_value nw = nullptr, nh = nullptr;
  napi_create_int32(env, static_cast<int32_t>(image.width), &nw);
  napi_create_int32(env, static_cast<int32_t>(image.height), &nh);
  napi_set_named_property(env, result, "width", nw);
  napi_set_named_property(env, result, "height", nh);
  if (image.bc7) {
    napi_value levels = nullptr;
    napi_create_array_with_length(env, image.levels.size(), &levels);
    for (size_t i = 0; i < image.levels.size(); ++i)
      napi_set_element(env, levels, static_cast<uint32_t>(i),
                       makeArrayBuffer(env, image.levels[i]));
    setString(env, result, "format", "bc7");
    napi_set_named_property(env, result, "levels", levels);
  } else {
    setString(env, result, "format", "rgba");
    napi_set_named_property(env, result, "rgba", makeArrayBuffer(env, image.rgba));
  }
  return result;
}

// __cortexTranscodeKtx2(bytes) → resultado | null. Síncrono, na thread JS.
napi_value jsTranscodeKtx2(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  napi_value nullValue = nullptr;
  napi_get_null(env, &nullValue);

  void* bytes = nullptr;
  size_t size = 0;
  if (argc < 1 || !getSourceBytes(env, args[0], &bytes, &size)) return nullValue;
  Ktx2Image image;
  if (!transcodeKtx2(static_cast<const uint8_t*>(bytes), size, image)) return nullValue;
  return toJsResult(env, image);
}

void rejectWith(napi_env env, napi_deferred deferred, const char* message) {
  napi_value msg = nullptr, err = nullptr;
  napi_create_string_utf8(env, message, NAPI_AUTO_LENGTH, &msg);
  napi_create_error(env, nullptr, msg, &err);
  napi_reject_deferred(env, deferred, err);
}

// __cortexTranscodeKtx2Async(bytes) → Promise<resultado> (SPEC-0287). O
// transcode roda num worker do io_pool; a Promise fecha no drain (thread JS).
napi_value jsTranscodeKtx2Async(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);

  struct State {
    std::vector<uint8_t> input;  // cópia: o ArrayBuffer JS não sai da thread JS
    Ktx2Image image;
    bool ok = false;
  };
  auto state = std::make_shared<State>();
  void* bytes = nullptr;
  size_t size = 0;
  const bool validInput = argc >= 1 && getSourceBytes(env, args[0], &bytes, &size);
  if (validInput && bytes)
    state->input.assign(static_cast<const uint8_t*>(bytes),
                        static_cast<const uint8_t*>(bytes) + size);

  return submitIoJob(
      env, "ktx2 transcode",
      [state] {
        state->ok = transcodeKtx2(state->input.data(), state->input.size(), state->image);
        state->input = {};  // solta a entrada já no worker
      },
      [state](napi_env e, napi_deferred deferred) {
        if (!state->ok) {
          rejectWith(e, deferred, "__cortexTranscodeKtx2Async: transcode falhou");
          return;
        }
        napi_resolve_deferred(e, deferred, toJsResult(e, state->image));
      });
}

}  // namespace

void registerKtx2(napi_env env) {
  napi_value global = nullptr;
  napi_get_global(env, &global);
  njs::setMethod(env, global, "__cortexTranscodeKtx2", jsTranscodeKtx2);
  njs::setMethod(env, global, "__cortexTranscodeKtx2Async", jsTranscodeKtx2Async);
}

}  // namespace shims
