// Registro de fontes da UI de runtime (ADR-0715 / SPEC-0716): família → fonte
// stb_truetype. A família "" é a padrão (Roboto Medium, ADR-0103); as outras vêm
// de arquivos do jogo via __cortexLoadFont. Sem NAPI: testável no
// cortex_host_tests. Só a thread do JS usa (o raster roda nela).
#pragma once

#include <stb_truetype.h>

#include <cstdint>
#include <string>
#include <vector>

namespace shims {

struct UiFont {
  std::vector<unsigned char> data;  // stbtt aponta pra cá: não pode realocar
  stbtt_fontinfo info{};
};

// Registra `bytes` sob `family`. `false` se não é uma TTF/OTF válida. Família já
// registrada → `true` sem trocar (os caches do JS guardam máscaras por família).
bool registerUiFont(const std::string& family, std::vector<unsigned char> bytes);

// Fonte da família; vazia ou desconhecida → a padrão. `nullptr` sem nenhuma.
const UiFont* findUiFont(const std::string& family);

// Só a família exata (sem cair na padrão). `nullptr` se não registrada.
const UiFont* findExactUiFont(const std::string& family);

// Largura de avanço (px, com kerning) do texto UTF-8 em `sizePx` (escala por EM).
float uiTextAdvance(const UiFont& font, const std::string& text, float sizePx);

// Próximo codepoint UTF-8 (suficiente pra PT-BR e símbolos).
uint32_t nextCodepoint(const std::string& text, size_t* i);

}  // namespace shims
