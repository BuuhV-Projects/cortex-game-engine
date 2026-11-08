#define STB_TRUETYPE_IMPLEMENTATION
#include "font_registry.h"

#include <map>
#include <memory>

namespace shims {
namespace {

// unique_ptr: o stbtt_fontinfo guarda ponteiro pros bytes; o nó não pode mover.
std::map<std::string, std::unique_ptr<UiFont>> g_fonts;

// Menor arquivo que tem a offset table do sfnt (versão + nº de tabelas + busca).
constexpr size_t kMinFontBytes = 12;

}  // namespace

bool registerUiFont(const std::string& family, std::vector<unsigned char> bytes) {
  if (g_fonts.count(family)) return true;
  if (bytes.size() < kMinFontBytes) return false;
  auto font = std::make_unique<UiFont>();
  font->data = std::move(bytes);
  const int offset = stbtt_GetFontOffsetForIndex(font->data.data(), 0);
  if (offset < 0 || stbtt_InitFont(&font->info, font->data.data(), offset) == 0) return false;
  g_fonts.emplace(family, std::move(font));
  return true;
}

const UiFont* findExactUiFont(const std::string& family) {
  auto it = g_fonts.find(family);
  return it == g_fonts.end() ? nullptr : it->second.get();
}

const UiFont* findUiFont(const std::string& family) {
  const UiFont* font = findExactUiFont(family);
  return font ? font : findExactUiFont(std::string());
}

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
    uint32_t cp = ((b0 & 0x0f) << 12) | ((text[*i + 1] & 0x3f) << 6) | (text[*i + 2] & 0x3f);
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

float uiTextAdvance(const UiFont& font, const std::string& text, float sizePx) {
  const float scale = stbtt_ScaleForMappingEmToPixels(&font.info, sizePx);
  float width = 0;
  uint32_t previous = 0;
  for (size_t i = 0; i < text.size();) {
    const uint32_t cp = nextCodepoint(text, &i);
    int advance = 0, bearing = 0;
    stbtt_GetCodepointHMetrics(&font.info, static_cast<int>(cp), &advance, &bearing);
    if (previous)
      width += scale * stbtt_GetCodepointKernAdvance(&font.info, static_cast<int>(previous),
                                                     static_cast<int>(cp));
    width += advance * scale;
    previous = cp;
  }
  return width;
}

}  // namespace shims
