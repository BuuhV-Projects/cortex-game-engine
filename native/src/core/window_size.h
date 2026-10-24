// Tamanho da janela do modo de desenvolvimento (SPEC-0455): `CORTEX_WINDOW_SIZE`
// = "<largura>x<altura>". Parser PURO (sem SDL), testado em cortex_host_tests.
#pragma once

#include <cstdlib>

namespace core {

struct WindowSize {
  int width;
  int height;
};

// Limites de sanidade: abaixo disso a UI não cabe; acima, nenhum monitor real.
inline constexpr int kMinWindowWidth = 320;
inline constexpr int kMinWindowHeight = 200;
inline constexpr int kMaxWindowWidth = 7680;
inline constexpr int kMaxWindowHeight = 4320;
inline constexpr int kDecimalBase = 10;

// "1920x1080" → {1920, 1080}. Nulo, mal formado ou fora dos limites → `fallback`.
inline WindowSize parseWindowSize(const char* text, WindowSize fallback) {
  if (text == nullptr) return fallback;
  char* end = nullptr;
  const long width = std::strtol(text, &end, kDecimalBase);
  if (end == text || (*end != 'x' && *end != 'X')) return fallback;
  const char* heightText = end + 1;
  const long height = std::strtol(heightText, &end, kDecimalBase);
  if (end == heightText || *end != '\0') return fallback;
  if (width < kMinWindowWidth || width > kMaxWindowWidth || height < kMinWindowHeight ||
      height > kMaxWindowHeight) {
    return fallback;
  }
  return {static_cast<int>(width), static_cast<int>(height)};
}

}  // namespace core
