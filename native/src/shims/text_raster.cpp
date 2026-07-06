#include "text_raster.h"

#define STB_TRUETYPE_IMPLEMENTATION
#include <stb_truetype.h>

#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <vector>

#include "../napi/napi_util.h"

namespace shims {
namespace {

std::vector<unsigned char> g_fontData;
stbtt_fontinfo g_font;
bool g_fontReady = false;

bool loadFontFile(const std::string& path) {
  FILE* file = std::fopen(path.c_str(), "rb");
  if (!file) return false;
  std::fseek(file, 0, SEEK_END);
  long size = std::ftell(file);
  std::fseek(file, 0, SEEK_SET);
  g_fontData.resize(static_cast<size_t>(size));
  std::fread(g_fontData.data(), 1, g_fontData.size(), file);
  std::fclose(file);
  return stbtt_InitFont(&g_font, g_fontData.data(),
                        stbtt_GetFontOffsetForIndex(g_fontData.data(), 0)) != 0;
}

// Decodifica o próximo codepoint UTF-8 (suficiente pra PT-BR e símbolos).
uint32_t nextCodepoint(const std::string& text, size_t* i) {
  const unsigned char b0 = text[*i];
  if (b0 < 0x80) {
    *i += 1;
    return b0;
  }
  if (b0 < 0xe0 && *i + 1 < text.size()) {
    uint32_t cp = ((b0 & 0x1f) << 6) | (text[*i + 1] & 0x3f);
    *i += 2;
    return cp;
  }
  if (b0 < 0xf0 && *i + 2 < text.size()) {
    uint32_t cp = ((b0 & 0x0f) << 12) | ((text[*i + 1] & 0x3f) << 6) |
                  (text[*i + 2] & 0x3f);
    *i += 3;
    return cp;
  }
  if (*i + 3 < text.size()) {
    uint32_t cp = ((b0 & 0x07) << 18) | ((text[*i + 1] & 0x3f) << 12) |
                  ((text[*i + 2] & 0x3f) << 6) | (text[*i + 3] & 0x3f);
    *i += 4;
    return cp;
  }
  *i += 1;
  return '?';
}

// __cortexRasterText(texto, alturaPx) → {width, height, rgba}|null
napi_value jsRasterText(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value args[2];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  napi_value nullValue = nullptr;
  napi_get_null(env, &nullValue);
  if (!g_fontReady || argc < 2) return nullValue;

  std::string text = njs::toString(env, args[0]);
  double sizePx = 16;
  napi_get_value_double(env, args[1], &sizePx);
  if (text.empty() || sizePx <= 0) return nullValue;

  const float scale =
      stbtt_ScaleForPixelHeight(&g_font, static_cast<float>(sizePx));
  int ascent = 0, descent = 0, lineGap = 0;
  stbtt_GetFontVMetrics(&g_font, &ascent, &descent, &lineGap);
  const int baseline = static_cast<int>(std::ceil(ascent * scale));
  const int height =
      static_cast<int>(std::ceil((ascent - descent) * scale)) + 2;

  // 1º passo: largura total (advance + kerning)
  float widthF = 0;
  uint32_t previous = 0;
  for (size_t i = 0; i < text.size();) {
    uint32_t cp = nextCodepoint(text, &i);
    int advance = 0, bearing = 0;
    stbtt_GetCodepointHMetrics(&g_font, static_cast<int>(cp), &advance,
                               &bearing);
    if (previous)
      widthF += scale * stbtt_GetCodepointKernAdvance(
                            &g_font, static_cast<int>(previous),
                            static_cast<int>(cp));
    widthF += advance * scale;
    previous = cp;
  }
  const int width = static_cast<int>(std::ceil(widthF)) + 2;

  // 2º passo: rasteriza em coverage (1 canal) e converte pra RGBA branco
  std::vector<unsigned char> coverage(
      static_cast<size_t>(width) * height, 0);
  float penX = 1;
  previous = 0;
  for (size_t i = 0; i < text.size();) {
    uint32_t cp = nextCodepoint(text, &i);
    if (previous)
      penX += scale * stbtt_GetCodepointKernAdvance(
                          &g_font, static_cast<int>(previous),
                          static_cast<int>(cp));
    int x0, y0, x1, y1;
    stbtt_GetCodepointBitmapBox(&g_font, static_cast<int>(cp), scale, scale,
                                &x0, &y0, &x1, &y1);
    const int gw = x1 - x0, gh = y1 - y0;
    const int destX = static_cast<int>(penX) + x0;
    const int destY = baseline + y0;
    if (gw > 0 && gh > 0 && destX >= 0 && destY >= 0 &&
        destX + gw <= width && destY + gh <= height) {
      stbtt_MakeCodepointBitmap(
          &g_font, coverage.data() + destY * width + destX, gw, gh, width,
          scale, scale, static_cast<int>(cp));
    }
    int advance = 0, bearing = 0;
    stbtt_GetCodepointHMetrics(&g_font, static_cast<int>(cp), &advance,
                               &bearing);
    penX += advance * scale;
    previous = cp;
  }

  void* rgbaData = nullptr;
  napi_value rgba = nullptr;
  napi_create_arraybuffer(env, coverage.size() * 4, &rgbaData, &rgba);
  auto* out = static_cast<unsigned char*>(rgbaData);
  for (size_t p = 0; p < coverage.size(); ++p) {
    out[p * 4] = 255;
    out[p * 4 + 1] = 255;
    out[p * 4 + 2] = 255;
    out[p * 4 + 3] = coverage[p];
  }

  napi_value result = njs::makeObject(env);
  napi_value v = nullptr;
  napi_create_int32(env, width, &v);
  napi_set_named_property(env, result, "width", v);
  napi_create_int32(env, height, &v);
  napi_set_named_property(env, result, "height", v);
  napi_set_named_property(env, result, "rgba", rgba);
  return result;
}

}  // namespace

void registerTextRaster(napi_env env, const std::string& baseDir,
                        const std::string& exeDir) {
  g_fontReady = loadFontFile(baseDir + "Roboto-Regular.ttf") ||
                loadFontFile(exeDir + "Roboto-Regular.ttf");
  if (!g_fontReady) {
    std::fprintf(stderr,
                 "[ui] Roboto-Regular.ttf não encontrada (%s | %s) — "
                 "UI de runtime sem texto\n",
                 baseDir.c_str(), exeDir.c_str());
  }
  napi_value global = nullptr;
  napi_get_global(env, &global);
  njs::setMethod(env, global, "__cortexRasterText", jsRasterText);
}

}  // namespace shims
