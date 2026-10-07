// Laço quente do drawImage do canvas 2D do host (ADR-0318): para cada pixel da
// caixa de destino, volta pela inversa, amostra a fonte (bilinear ou vizinho)
// e compõe source-over no RGBA não pré-multiplicado. Tradução 1:1 do
// `blitImage` de native/js/src/shims/canvas2d/bitmap.js — pixel idêntico
// (conferido contra native/tests/blit_golden.h). C++ puro, sem SO.
#pragma once

#include <cstddef>
#include <cstdint>

namespace cortex2d {

// Layout de `params` — o mesmo dos BLIT_* do bitmap.js.
enum BlitParam : int {
  kBlitX0 = 0,
  kBlitY0 = 1,
  kBlitX1 = 2,
  kBlitY1 = 3,
  kBlitInv = 4,  // 6 elementos da inversa (a, b, c, d, e, f)
  kBlitSx = 10,
  kBlitSy = 11,
  kBlitSw = 12,
  kBlitSh = 13,
  kBlitLimX0 = 14,
  kBlitLimY0 = 15,
  kBlitLimX1 = 16,
  kBlitLimY1 = 17,
  kBlitAlpha = 18,
  kBlitParamCount = 19,
};

struct BlitTarget {
  uint8_t* data;  // RGBA8, width × height
  int width;
  int height;
};

struct BlitSource {
  const uint8_t* data;  // RGBA8, width × height
  int width;
  int height;
};

// Confere que caixa, limites e clip cabem nos buffers (o laço não checa por
// pixel). `clipLength` = 0 sem clip. Devolve nullptr se ok, ou o motivo.
const char* validateBlit(const BlitTarget& dst, const BlitSource& src,
                         const double* params, size_t clipLength);

// Desenha `src` em `dst` (chame só depois de validateBlit devolver nullptr).
// `clip` (width × height de dst, 0..255) ou nullptr.
void blitImage(const BlitTarget& dst, const BlitSource& src,
               const double* params, const uint8_t* clip, bool smooth);

}  // namespace cortex2d
