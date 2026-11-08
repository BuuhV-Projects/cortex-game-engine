#include "text_raster.h"

#include <atomic>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <vector>

#include "../napi/napi_util.h"
#include "files.h"
#include "font_registry.h"
#include "perf_arraybuffer.h"

namespace shims {
namespace {

// Telemetria (SPEC-0321): rasters VIVOS por origem. Conta na criação e
// desconta no finalizador do ArrayBuffer (GC) — o contador `text` do
// perf_arraybuffer é só o total ALOCADO desde o boot e não separa vazamento
// de churn coletável.
enum class RasterOrigin { kUi, kCanvas, kOther, kCount };
struct LiveCounter {
  std::atomic<int64_t> count{0};
  std::atomic<int64_t> bytes{0};
};
LiveCounter g_live[static_cast<size_t>(RasterOrigin::kCount)];
const bool g_textLog = std::getenv("CORTEX_TEXT_LOG") != nullptr;

RasterOrigin parseOrigin(const std::string& origin) {
  if (origin == "ui") return RasterOrigin::kUi;
  if (origin == "canvas") return RasterOrigin::kCanvas;
  return RasterOrigin::kOther;
}

// Dado do finalizador (finalize_data): bytes << 2 | origem (sem alocar nada por raster).
constexpr uintptr_t kOriginBits = 2;
constexpr uintptr_t kOriginMask = (1u << kOriginBits) - 1;

void onRasterCollected(napi_env /*env*/, void* data, void* /*hint*/) {
  const uintptr_t packed = reinterpret_cast<uintptr_t>(data);
  auto& c = g_live[packed & kOriginMask];
  c.count.fetch_sub(1, std::memory_order_relaxed);
  c.bytes.fetch_sub(static_cast<int64_t>(packed >> kOriginBits), std::memory_order_relaxed);
}

void trackLiveRaster(napi_env env, napi_value buffer, RasterOrigin origin, size_t bytes) {
  auto& c = g_live[static_cast<size_t>(origin)];
  c.count.fetch_add(1, std::memory_order_relaxed);
  c.bytes.fetch_add(static_cast<int64_t>(bytes), std::memory_order_relaxed);
  const uintptr_t packed = (static_cast<uintptr_t>(bytes) << kOriginBits) | static_cast<uintptr_t>(origin);
  napi_add_finalizer(env, buffer, reinterpret_cast<void*>(packed), onRasterCollected, nullptr, nullptr);
}

// Fonte padrão (Roboto, ao lado do exe/jogo, fora do pak — ADR-0103).
bool loadDefaultFont(const std::string& path) {
  FILE* file = std::fopen(path.c_str(), "rb");
  if (!file) return false;
  std::fseek(file, 0, SEEK_END);
  const long size = std::ftell(file);
  std::fseek(file, 0, SEEK_SET);
  std::vector<unsigned char> bytes(size > 0 ? static_cast<size_t>(size) : 0);
  if (!bytes.empty()) std::fread(bytes.data(), 1, bytes.size(), file);
  std::fclose(file);
  return registerUiFont(std::string(), std::move(bytes));
}

// __cortexLoadFont(família, url) → boolean. Bytes pelo leitor de assets do host
// (assets.pak no export, arquivo solto em dev) — ADR-0715.
napi_value jsLoadFont(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value args[2];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  bool ok = false;
  if (argc >= 2) {
    const std::string family = njs::toString(env, args[0]);
    const std::string url = njs::toString(env, args[1]);
    std::vector<uint8_t> bytes;
    ok = !family.empty() && readAssetBytes(url, bytes) && registerUiFont(family, std::move(bytes));
    if (!ok) std::fprintf(stderr, "[ui] fonte \"%s\" não carregou de \"%s\"\n", family.c_str(), url.c_str());
  }
  napi_value result = nullptr;
  napi_get_boolean(env, ok, &result);
  return result;
}

// __cortexFontMetrics(família) → { ascent, descent } em EM (descent positivo),
// ou null se a família não está registrada. O canvas 2D põe a linha de base com isto.
napi_value jsFontMetrics(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  napi_value nullValue = nullptr;
  napi_get_null(env, &nullValue);
  const UiFont* font = findExactUiFont(argc >= 1 ? njs::toString(env, args[0]) : std::string());
  if (!font) return nullValue;
  const float perEm = stbtt_ScaleForMappingEmToPixels(&font->info, 1.0f);
  int ascent = 0, descent = 0, lineGap = 0;
  stbtt_GetFontVMetrics(&font->info, &ascent, &descent, &lineGap);
  napi_value result = njs::makeObject(env);
  napi_value v = nullptr;
  napi_create_double(env, ascent * perEm, &v);
  napi_set_named_property(env, result, "ascent", v);
  napi_create_double(env, -descent * perEm, &v);
  napi_set_named_property(env, result, "descent", v);
  return result;
}

// __cortexRasterText(texto, alturaPx, origem?, família?) → {width, height, rgba}|null
// `origem` ("ui" | "canvas") só alimenta a telemetria (SPEC-0321). `família`
// vazia ou não registrada = Roboto (ADR-0715).
napi_value jsRasterText(napi_env env, napi_callback_info info) {
  size_t argc = 4;
  napi_value args[4];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);
  napi_value nullValue = nullptr;
  napi_get_null(env, &nullValue);
  const UiFont* font = findUiFont(argc >= 4 ? njs::toString(env, args[3]) : std::string());
  if (!font || argc < 2) return nullValue;
  const stbtt_fontinfo& face = font->info;

  std::string text = njs::toString(env, args[0]);
  double sizePx = 16;
  napi_get_value_double(env, args[1], &sizePx);
  if (text.empty() || sizePx <= 0) return nullValue;
  const std::string originName = argc >= 3 ? njs::toString(env, args[2]) : std::string();
  const RasterOrigin origin = parseOrigin(originName);
  if (g_textLog) std::printf("[text] %s %.1fpx \"%s\"\n", originName.c_str(), sizePx, text.c_str());

  // Escala por EM (não por ascent-descent): CSS `font-size: N px` mapeia o EM
  // da fonte pra N px. `ScaleForPixelHeight` (altura ascent-descent → N) daria
  // glifos ~15% MENORES que o DOM do Studio pro mesmo fontSize — texto do
  // export sairia menor. `ScaleForMappingEmToPixels` casa com o CSS/DOM.
  const float scale =
      stbtt_ScaleForMappingEmToPixels(&face, static_cast<float>(sizePx));
  int ascent = 0, descent = 0, lineGap = 0;
  stbtt_GetFontVMetrics(&face, &ascent, &descent, &lineGap);
  const int baseline = static_cast<int>(std::ceil(ascent * scale));
  const int height =
      static_cast<int>(std::ceil((ascent - descent) * scale)) + 2;

  // 1º passo: largura total (advance + kerning)
  const int width = static_cast<int>(std::ceil(uiTextAdvance(*font, text, static_cast<float>(sizePx)))) + 2;

  // 2º passo: rasteriza em coverage (1 canal) e converte pra RGBA branco
  std::vector<unsigned char> coverage(
      static_cast<size_t>(width) * height, 0);
  float penX = 1;
  uint32_t previous = 0;
  for (size_t i = 0; i < text.size();) {
    uint32_t cp = nextCodepoint(text, &i);
    if (previous)
      penX += scale * stbtt_GetCodepointKernAdvance(
                          &face, static_cast<int>(previous),
                          static_cast<int>(cp));
    int x0, y0, x1, y1;
    stbtt_GetCodepointBitmapBox(&face, static_cast<int>(cp), scale, scale,
                                &x0, &y0, &x1, &y1);
    const int gw = x1 - x0, gh = y1 - y0;
    const int destX = static_cast<int>(penX) + x0;
    const int destY = baseline + y0;
    if (gw > 0 && gh > 0 && destX >= 0 && destY >= 0 &&
        destX + gw <= width && destY + gh <= height) {
      stbtt_MakeCodepointBitmap(
          &face, coverage.data() + destY * width + destX, gw, gh, width,
          scale, scale, static_cast<int>(cp));
    }
    int advance = 0, bearing = 0;
    stbtt_GetCodepointHMetrics(&face, static_cast<int>(cp), &advance,
                               &bearing);
    penX += advance * scale;
    previous = cp;
  }

  void* rgbaData = nullptr;
  napi_value rgba = nullptr;
  napi_create_arraybuffer(env, coverage.size() * 4, &rgbaData, &rgba);
  trackLiveRaster(env, rgba, origin, coverage.size() * 4);
  trackArrayBufferBytes(ArrayBufferSource::kTextRaster, coverage.size() * 4);
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
  // Roboto MEDIUM = fonte oficial da UI (ADR-0103): o Studio (DOM) usa a mesma
  // via @font-face, então o preview bate com o export. Fallback pra Regular só
  // se a Medium faltar (build antigo).
  const bool ready = loadDefaultFont(baseDir + "Roboto-Medium.ttf") ||
                     loadDefaultFont(exeDir + "Roboto-Medium.ttf") ||
                     loadDefaultFont(baseDir + "Roboto-Regular.ttf") ||
                     loadDefaultFont(exeDir + "Roboto-Regular.ttf");
  if (!ready) {
    std::fprintf(stderr,
                 "[ui] Roboto-Medium.ttf não encontrada (%s | %s) — "
                 "UI de runtime sem texto\n",
                 baseDir.c_str(), exeDir.c_str());
  }
  napi_value global = nullptr;
  napi_get_global(env, &global);
  njs::setMethod(env, global, "__cortexRasterText", jsRasterText);
  njs::setMethod(env, global, "__cortexLoadFont", jsLoadFont);
  njs::setMethod(env, global, "__cortexFontMetrics", jsFontMetrics);
}

int dumpTextRasterLive(char* buf, size_t bufSize) {
  static const char* const kLabels[] = {"ui", "canvas", "outro"};
  int written = 0;
  for (size_t i = 0; i < static_cast<size_t>(RasterOrigin::kCount); ++i) {
    const double mb = static_cast<double>(g_live[i].bytes.load(std::memory_order_relaxed)) / (1024.0 * 1024.0);
    const int n = std::snprintf(buf + written, bufSize > static_cast<size_t>(written) ? bufSize - written : 0,
                                "%s%s=%lldx/%.1fMB", written ? " " : "", kLabels[i],
                                static_cast<long long>(g_live[i].count.load(std::memory_order_relaxed)), mb);
    if (n > 0) written += n;
  }
  return written;
}

}  // namespace shims
