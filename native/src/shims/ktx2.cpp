#include "ktx2.h"

#include <cstdint>

#include "../napi/napi_util.h"
// Transcoder do basis_universal (third-party). Defines no CMake:
// BASISD_SUPPORT_KTX2=1, BASISD_SUPPORT_KTX2_ZSTD=0.
#include "basisu_transcoder.h"

namespace shims {
namespace {

bool g_inited = false;  // tabelas de lookup do transcoder — inicializa 1x.

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

napi_value jsTranscodeKtx2(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  napi_value nullValue = nullptr;
  napi_get_null(env, &nullValue);

  void* bytes = nullptr;
  size_t size = 0;
  if (argc < 1 || !getSourceBytes(env, args[0], &bytes, &size) || size == 0)
    return nullValue;

  if (!g_inited) {
    basist::basisu_transcoder_init();
    g_inited = true;
  }

  basist::ktx2_transcoder trans;
  if (!trans.init(bytes, static_cast<uint32_t>(size))) return nullValue;
  if (!trans.start_transcoding()) return nullValue;

  const uint32_t w = trans.get_width();
  const uint32_t h = trans.get_height();
  if (w == 0 || h == 0) return nullValue;

  const size_t rgbaSize = static_cast<size_t>(w) * h * 4;
  void* out = nullptr;
  napi_value rgba = nullptr;
  napi_create_arraybuffer(env, rgbaSize, &out, &rgba);
  if (!out) return nullValue;

  // Nível 0, layer 0, face 0 → RGBA32 raster (buf em PIXELS = w*h).
  if (!trans.transcode_image_level(0, 0, 0, out, w * h,
                                   basist::transcoder_texture_format::cTFRGBA32)) {
    return nullValue;
  }

  napi_value result = njs::makeObject(env);
  napi_value nw = nullptr, nh = nullptr;
  napi_create_int32(env, static_cast<int32_t>(w), &nw);
  napi_create_int32(env, static_cast<int32_t>(h), &nh);
  napi_set_named_property(env, result, "width", nw);
  napi_set_named_property(env, result, "height", nh);
  napi_set_named_property(env, result, "rgba", rgba);
  return result;
}

}  // namespace

void registerKtx2(napi_env env) {
  napi_value global = nullptr;
  napi_get_global(env, &global);
  njs::setMethod(env, global, "__cortexTranscodeKtx2", jsTranscodeKtx2);
}

}  // namespace shims
