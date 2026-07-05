#include "image_decode.h"

#define STB_IMAGE_IMPLEMENTATION
#define STBI_NO_STDIO
#include <stb_image.h>

#include <cstring>

#include "../napi/napi_util.h"

namespace shims {
namespace {

// Aceita ArrayBuffer ou TypedArray com os bytes do arquivo de imagem.
bool getSourceBytes(napi_env env, napi_value value, void** data,
                    size_t* size) {
  bool isTypedArray = false;
  napi_is_typedarray(env, value, &isTypedArray);
  if (isTypedArray) {
    napi_typedarray_type type;
    size_t length = 0;
    napi_value arrayBuffer = nullptr;
    size_t byteOffset = 0;
    napi_get_typedarray_info(env, value, &type, &length, data, &arrayBuffer,
                             &byteOffset);
    *size = length;  // bytes só se Uint8Array — suficiente pro uso (Blob)
    return type == napi_uint8_array;
  }
  bool isArrayBuffer = false;
  napi_is_arraybuffer(env, value, &isArrayBuffer);
  if (isArrayBuffer)
    return napi_get_arraybuffer_info(env, value, data, size) == napi_ok;
  return false;
}

napi_value jsDecodeImage(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  napi_value nullValue = nullptr;
  napi_get_null(env, &nullValue);

  void* bytes = nullptr;
  size_t size = 0;
  if (argc < 1 || !getSourceBytes(env, args[0], &bytes, &size) || size == 0)
    return nullValue;

  int width = 0, height = 0, channels = 0;
  stbi_uc* pixels = stbi_load_from_memory(
      static_cast<const stbi_uc*>(bytes), static_cast<int>(size), &width,
      &height, &channels, 4 /* força RGBA */);
  if (!pixels) return nullValue;

  size_t rgbaSize = static_cast<size_t>(width) * height * 4;
  void* out = nullptr;
  napi_value rgba = nullptr;
  napi_create_arraybuffer(env, rgbaSize, &out, &rgba);
  std::memcpy(out, pixels, rgbaSize);
  stbi_image_free(pixels);

  napi_value result = njs::makeObject(env);
  napi_value w = nullptr, h = nullptr;
  napi_create_int32(env, width, &w);
  napi_create_int32(env, height, &h);
  napi_set_named_property(env, result, "width", w);
  napi_set_named_property(env, result, "height", h);
  napi_set_named_property(env, result, "rgba", rgba);
  return result;
}

}  // namespace

void registerImageDecode(napi_env env) {
  napi_value global = nullptr;
  napi_get_global(env, &global);
  njs::setMethod(env, global, "__cortexDecodeImage", jsDecodeImage);
}

}  // namespace shims
