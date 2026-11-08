// Testes do registro de fontes da UI (ADR-0715 / SPEC-0716): TTF de arquivo
// registrada por família, medida própria e família desconhecida caindo na padrão.
#include <fstream>
#include <iterator>
#include <string>
#include <vector>

#include "../src/shims/font_registry.h"
#include "harness.h"

namespace tests {
namespace {

constexpr float kSizePx = 22.0f;
const std::string kSample = "OBJETIVO";

std::vector<unsigned char> readBytes(const std::string& path) {
  std::ifstream file(path, std::ios::binary);
  return {std::istreambuf_iterator<char>(file), {}};
}

}  // namespace

void testUiFontRegistry() {
  using namespace shims;
  // Padrão = Roboto Medium (a mesma que o CMake copia pro lado do exe).
  CHECK(registerUiFont("", readBytes(CORTEX_DEFAULT_UI_FONT)));
  // Fonte do jogo: Bebas Neue (OFL), a mesma TTF da fixture native/fixtures/ui-font.
  CHECK(registerUiFont("Bebas", readBytes(CORTEX_UI_FONT_FIXTURE)));

  const UiFont* roboto = findExactUiFont("");
  const UiFont* bebas = findExactUiFont("Bebas");
  CHECK(roboto != nullptr);
  CHECK(bebas != nullptr && bebas != roboto);
  if (!roboto || !bebas) return;

  // Família desconhecida (ou vazia) cai na padrão; a exata não inventa fonte.
  CHECK(findUiFont("Nenhuma") == roboto);
  CHECK(findUiFont("") == roboto);
  CHECK(findUiFont("Bebas") == bebas);
  CHECK(findExactUiFont("Nenhuma") == nullptr);

  // Bebas é condensada: o mesmo texto mede menos que na Roboto.
  const float robotoWidth = uiTextAdvance(*roboto, kSample, kSizePx);
  const float bebasWidth = uiTextAdvance(*bebas, kSample, kSizePx);
  CHECK(bebasWidth > 0.0f);
  CHECK(bebasWidth < robotoWidth);

  // Registrar de novo não troca a fonte (os caches do JS são por família).
  CHECK(registerUiFont("Bebas", readBytes(CORTEX_DEFAULT_UI_FONT)));
  CHECK(findExactUiFont("Bebas") == bebas);

  // Bytes que não são fonte: recusa sem registrar.
  CHECK(!registerUiFont("Lixo", std::vector<unsigned char>(64, 0)));
  CHECK(!registerUiFont("Curto", {1, 2, 3}));
  CHECK(findExactUiFont("Lixo") == nullptr);
}

}  // namespace tests
