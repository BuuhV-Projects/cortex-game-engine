// Paridade do blit do canvas 2D (ADR-0318): o C++ tem que reproduzir BYTE A
// BYTE o laço JS do bitmap.js, capturado em blit_golden.h por
// native/scripts/gen-blit-golden.mjs (o vitest confere o lado do JS).
#include "../src/canvas2d/blit.h"

#include <cstdio>
#include <cstring>
#include <vector>

#include "blit_golden.h"
#include "harness.h"

namespace tests {

void testBlitBateComOGoldenDoJs() {
  using namespace blit_golden;
  constexpr int kBpp = 4;
  for (const Case& c : kCases) {
    std::vector<uint8_t> dst(c.before, c.before + kDstW * kDstH * kBpp);
    const cortex2d::BlitTarget target{dst.data(), kDstW, kDstH};
    const cortex2d::BlitSource source{c.src, kSrcW, kSrcH};
    const size_t clipLength = c.clip ? static_cast<size_t>(kDstW) * kDstH : 0;
    CHECK(cortex2d::validateBlit(target, source, c.params, clipLength) == nullptr);
    cortex2d::blitImage(target, source, c.params, c.clip, c.smooth);
    int diff = 0;
    for (size_t i = 0; i < dst.size(); i++) {
      if (dst[i] != c.expected[i]) {
        if (diff == 0) std::printf("  %s: 1o byte diferente em %zu (C++ %d, JS %d)\n", c.name, i, dst[i], c.expected[i]);
        diff++;
      }
    }
    CHECK(diff == 0);
  }
}

void testBlitRecusaArgumentosForaDoBuffer() {
  using namespace blit_golden;
  std::vector<uint8_t> dst(kDstW * kDstH * 4);
  const cortex2d::BlitTarget target{dst.data(), kDstW, kDstH};
  const cortex2d::BlitSource source{kCases[0].src, kSrcW, kSrcH};
  double p[cortex2d::kBlitParamCount];
  std::memcpy(p, kCases[0].params, sizeof p);
  CHECK(cortex2d::validateBlit(target, source, p, 0) == nullptr);
  p[cortex2d::kBlitY1] = kDstH + 1;  // caixa passa do destino
  CHECK(cortex2d::validateBlit(target, source, p, 0) != nullptr);
  std::memcpy(p, kCases[0].params, sizeof p);
  p[cortex2d::kBlitLimX1] = kSrcW;  // limite lê além da fonte
  CHECK(cortex2d::validateBlit(target, source, p, 0) != nullptr);
  std::memcpy(p, kCases[0].params, sizeof p);
  CHECK(cortex2d::validateBlit(target, source, p, 3) != nullptr);  // clip menor que o destino
}

}  // namespace tests
