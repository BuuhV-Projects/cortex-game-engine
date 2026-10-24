// Testes do parser de CORTEX_WINDOW_SIZE (SPEC-0455).
#include "../src/core/window_size.h"
#include "harness.h"

namespace tests {

void testWindowSizeParse() {
  using core::parseWindowSize;
  using core::WindowSize;
  const WindowSize fallback{1280, 720};
  const WindowSize full = parseWindowSize("1920x1080", fallback);
  CHECK(full.width == 1920 && full.height == 1080);
  const WindowSize upper = parseWindowSize("2560X1440", fallback);
  CHECK(upper.width == 2560 && upper.height == 1440);
  // Ausente, mal formado ou fora dos limites: o padrão, nunca lixo.
  CHECK(parseWindowSize(nullptr, fallback).width == 1280);
  CHECK(parseWindowSize("", fallback).width == 1280);
  CHECK(parseWindowSize("1920", fallback).width == 1280);
  CHECK(parseWindowSize("1920x", fallback).width == 1280);
  CHECK(parseWindowSize("1920x1080p", fallback).height == 720);
  CHECK(parseWindowSize("x1080", fallback).height == 720);
  CHECK(parseWindowSize("100x100", fallback).width == 1280);
  CHECK(parseWindowSize("99999x1080", fallback).width == 1280);
}

}  // namespace tests
