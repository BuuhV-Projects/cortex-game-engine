// __cortexBlitImage(dst: Uint8ClampedArray, dstW, src: Uint8Array|Uint8ClampedArray,
//                   srcW, params: Float64Array, clip: Uint8Array|null, smooth) → bool
// `false` = argumentos fora do esperado (o JS cai no laço próprio, ADR-0318).
#include "canvas_blit.h"

#include "../canvas2d/blit.h"
#include "../napi/napi_util.h"

namespace shims {
namespace {

constexpr size_t kArgCount = 7;
constexpr int kBytesPerPixel = 4;

struct TypedView {
  void* data = nullptr;
  size_t length = 0;  // elementos
  napi_typedarray_type type = napi_uint8_array;
};

bool typedView(napi_env env, napi_value value, TypedView* out) {
  bool is = false;
  if (napi_is_typedarray(env, value, &is) != napi_ok || !is) return false;
  return napi_get_typedarray_info(env, value, &out->type, &out->length, &out->data, nullptr, nullptr) == napi_ok;
}

bool isBytes(const TypedView& v) {
  return v.type == napi_uint8_array || v.type == napi_uint8_clamped_array;
}

napi_value boolean(napi_env env, bool v) {
  napi_value out = nullptr;
  napi_get_boolean(env, v, &out);
  return out;
}

napi_value jsBlitImage(napi_env env, napi_callback_info info) {
  size_t argc = kArgCount;
  napi_value args[kArgCount] = {};
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  if (argc < kArgCount) return boolean(env, false);
  TypedView dst, src, params, clip;
  int32_t dstW = 0, srcW = 0;
  bool smooth = false;
  if (!typedView(env, args[0], &dst) || !isBytes(dst)) return boolean(env, false);
  if (!typedView(env, args[2], &src) || !isBytes(src)) return boolean(env, false);
  if (!typedView(env, args[4], &params) || params.type != napi_float64_array ||
      params.length < cortex2d::kBlitParamCount) {
    return boolean(env, false);
  }
  napi_get_value_int32(env, args[1], &dstW);
  napi_get_value_int32(env, args[3], &srcW);
  napi_coerce_to_bool(env, args[6], &args[6]);
  napi_get_value_bool(env, args[6], &smooth);
  napi_valuetype clipType = napi_undefined;
  napi_typeof(env, args[5], &clipType);
  const bool hasClip = clipType != napi_null && clipType != napi_undefined;
  if (hasClip && (!typedView(env, args[5], &clip) || !isBytes(clip))) return boolean(env, false);
  if (dstW <= 0 || srcW <= 0) return boolean(env, false);
  const size_t dstRow = static_cast<size_t>(dstW) * kBytesPerPixel;
  const size_t srcRow = static_cast<size_t>(srcW) * kBytesPerPixel;
  const cortex2d::BlitTarget target{static_cast<uint8_t*>(dst.data), dstW, static_cast<int>(dst.length / dstRow)};
  const cortex2d::BlitSource source{static_cast<const uint8_t*>(src.data), srcW, static_cast<int>(src.length / srcRow)};
  const double* p = static_cast<const double*>(params.data);
  if (cortex2d::validateBlit(target, source, p, hasClip ? clip.length : 0)) return boolean(env, false);
  if (hasClip && clip.length == 0) return boolean(env, false);
  cortex2d::blitImage(target, source, p, hasClip ? static_cast<const uint8_t*>(clip.data) : nullptr, smooth);
  return boolean(env, true);
}

}  // namespace

void registerCanvasBlit(napi_env env) {
  napi_value global = nullptr;
  napi_get_global(env, &global);
  njs::setMethod(env, global, "__cortexBlitImage", jsBlitImage);
}

}  // namespace shims
