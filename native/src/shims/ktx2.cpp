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

  napi_value result = njs::makeObject(env);
  napi_value nw = nullptr, nh = nullptr;
  napi_create_int32(env, static_cast<int32_t>(w), &nw);
  napi_create_int32(env, static_cast<int32_t>(h), &nh);
  napi_set_named_property(env, result, "width", nw);
  napi_set_named_property(env, result, "height", nh);

  // ── BC7, todos os mips (SPEC-0155) ─────────────────────────────────────────
  // RGBA32 cru ocupava 4× mais VRAM que o Studio (KTX2Loader → BC7) e só
  // entregava o mip 0 (o three re-gerava mips na GPU). Todo hardware D3D12
  // suporta BC1–7 por spec; o device pede TextureCompressionBC (device.cpp).
  const uint32_t levelCount = trans.get_levels();
  bool bc7Ok = levelCount > 0;
  napi_value levels = nullptr;
  napi_create_array_with_length(env, levelCount, &levels);
  for (uint32_t level = 0; bc7Ok && level < levelCount; ++level) {
    const uint32_t lw = w >> level ? w >> level : 1;
    const uint32_t lh = h >> level ? h >> level : 1;
    const uint32_t blocksX = (lw + 3) / 4;
    const uint32_t blocksY = (lh + 3) / 4;
    const size_t byteSize = static_cast<size_t>(blocksX) * blocksY * 16;  // BC7: 16 B/bloco 4×4
    void* out = nullptr;
    napi_value buf = nullptr;
    napi_create_arraybuffer(env, byteSize, &out, &buf);
    if (!out ||
        !trans.transcode_image_level(level, 0, 0, out, blocksX * blocksY,
                                     basist::transcoder_texture_format::cTFBC7_RGBA)) {
      bc7Ok = false;
      break;
    }
    napi_set_element(env, levels, level, buf);
  }
  if (bc7Ok) {
    napi_value fmt = nullptr;
    napi_create_string_utf8(env, "bc7", NAPI_AUTO_LENGTH, &fmt);
    napi_set_named_property(env, result, "format", fmt);
    napi_set_named_property(env, result, "levels", levels);
    return result;
  }

  // ── Fallback RGBA32 (mip 0) — arquivos que o BC7 não cobrir ────────────────
  const size_t rgbaSize = static_cast<size_t>(w) * h * 4;
  void* out = nullptr;
  napi_value rgba = nullptr;
  napi_create_arraybuffer(env, rgbaSize, &out, &rgba);
  if (!out) return nullValue;
  if (!trans.transcode_image_level(0, 0, 0, out, w * h,
                                   basist::transcoder_texture_format::cTFRGBA32)) {
    return nullValue;
  }
  napi_value fmt = nullptr;
  napi_create_string_utf8(env, "rgba", NAPI_AUTO_LENGTH, &fmt);
  napi_set_named_property(env, result, "format", fmt);
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
