// Decode de imagem (PNG/JPG das texturas GLB) via stb_image:
// __cortexDecodeImage(bytes) → { width, height, rgba: ArrayBuffer } (RGBA8).
// O createImageBitmap do JS (js/src/shims/image.js) usa isto.
#pragma once

#include <node_api.h>

namespace shims {

void registerImageDecode(napi_env env);

}  // namespace shims
