// Ver blit.h. Cada passo espelha o bitmap.js na MESMA ordem de operações em
// double — trocar a ordem (ou deixar o compilador fundir em FMA) muda o último
// bit e o pixel deixa de bater com o JS.
#include "blit.h"

#include <cmath>
#include <cstring>

#if defined(__clang__)
#pragma clang fp contract(off)
#elif defined(_MSC_VER)
#pragma fp_contract(off)
#endif

namespace cortex2d {
namespace {

constexpr double kMaxByte = 255.0;
constexpr double kInvByte = 1.0 / kMaxByte;
constexpr double kPixelCenter = 0.5;
constexpr double kRound = 0.5;
constexpr uint32_t kOpaque = 0xff;
constexpr int kAlphaShift = 24;
constexpr int kShiftG = 8;
constexpr int kShiftB = 16;
constexpr uint32_t kChannel = 0xff;
constexpr int kBytesPerPixel = 4;
constexpr int kAlpha = 3;

// Escrita num Uint8ClampedArray (ToUint8Clamp): NaN → 0, prende em 0..255,
// arredonda ao par mais próximo no empate.
inline uint8_t clampByte(double v) {
  if (!(v > 0)) return 0;  // NaN e ≤ 0
  if (v >= kMaxByte) return 255;
  const double f = std::floor(v);
  const double half = f + kRound;
  if (v > half) return static_cast<uint8_t>(f + 1);
  if (v < half) return static_cast<uint8_t>(f);
  const int fi = static_cast<int>(f);
  return static_cast<uint8_t>((fi & 1) ? fi + 1 : fi);
}

inline uint32_t load32(const uint8_t* p) {
  uint32_t v;
  std::memcpy(&v, p, sizeof v);
  return v;
}

inline void store32(uint8_t* p, uint32_t v) { std::memcpy(p, &v, sizeof v); }

inline uint32_t packOpaque(double r, double g, double b) {
  const uint32_t ri = static_cast<uint32_t>(static_cast<int32_t>(r + kRound));
  const uint32_t gi = static_cast<uint32_t>(static_cast<int32_t>(g + kRound));
  const uint32_t bi = static_cast<uint32_t>(static_cast<int32_t>(b + kRound));
  return (kOpaque << kAlphaShift) | (bi << kShiftB) | (gi << kShiftG) | ri;
}

// composite.js blendPixel.
inline void blendPixel(uint8_t* d, double r, double g, double b, double sa) {
  if (sa >= 1) {
    d[0] = clampByte(r);
    d[1] = clampByte(g);
    d[2] = clampByte(b);
    d[kAlpha] = 255;
    return;
  }
  const double da = d[kAlpha] * kInvByte;
  const double keep = da * (1 - sa);
  const double oa = sa + keep;
  if (oa <= 0) return;
  const double inv = 1 / oa;
  d[0] = clampByte((r * sa + d[0] * keep) * inv);
  d[1] = clampByte((g * sa + d[1] * keep) * inv);
  d[2] = clampByte((b * sa + d[2] * keep) * inv);
  d[kAlpha] = clampByte(oa * kMaxByte);
}

struct Limits {
  double x0, y0, x1, y1;
};

inline double clampTo(double v, double lo, double hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

// bitmap.js sampleBilinear (o caminho genérico, com alfa).
inline void sampleBilinear(const BlitSource& src, double u, double v,
                           const Limits& lim, double out[4]) {
  const double fx = u - kPixelCenter;
  const double fy = v - kPixelCenter;
  double xa = std::floor(fx);
  double ya = std::floor(fy);
  const double tx = fx - xa;
  const double ty = fy - ya;
  double xb = xa + 1;
  double yb = ya + 1;
  xa = clampTo(xa, lim.x0, lim.x1);
  xb = clampTo(xb, lim.x0, lim.x1);
  ya = clampTo(ya, lim.y0, lim.y1);
  yb = clampTo(yb, lim.y0, lim.y1);
  const uint8_t* d = src.data;
  const int w = src.width;
  const size_t i00 = (static_cast<size_t>(ya) * w + static_cast<size_t>(xa)) * kBytesPerPixel;
  const size_t i10 = (static_cast<size_t>(ya) * w + static_cast<size_t>(xb)) * kBytesPerPixel;
  const size_t i01 = (static_cast<size_t>(yb) * w + static_cast<size_t>(xa)) * kBytesPerPixel;
  const size_t i11 = (static_cast<size_t>(yb) * w + static_cast<size_t>(xb)) * kBytesPerPixel;
  const double w00 = (1 - tx) * (1 - ty) * d[i00 + kAlpha];
  const double w10 = tx * (1 - ty) * d[i10 + kAlpha];
  const double w01 = (1 - tx) * ty * d[i01 + kAlpha];
  const double w11 = tx * ty * d[i11 + kAlpha];
  const double a = w00 + w10 + w01 + w11;
  out[kAlpha] = a;
  if (a <= 0) return;
  const double inv = 1 / a;
  for (int k = 0; k < kAlpha; k++) {
    out[k] = (d[i00 + k] * w00 + d[i10 + k] * w10 + d[i01 + k] * w01 + d[i11 + k] * w11) * inv;
  }
}

}  // namespace

const char* validateBlit(const BlitTarget& dst, const BlitSource& src,
                         const double* p, size_t clipLength) {
  if (!dst.data || !src.data || dst.width <= 0 || src.width <= 0) return "buffer vazio";
  for (int k = 0; k < kBlitParamCount; k++) {
    if (!std::isfinite(p[k])) return "parâmetro não finito";
  }
  if (p[kBlitX0] < 0 || p[kBlitY0] < 0 || p[kBlitX1] > dst.width || p[kBlitY1] > dst.height) {
    return "caixa fora do destino";
  }
  if (p[kBlitLimX0] < 0 || p[kBlitLimY0] < 0 || p[kBlitLimX1] >= src.width || p[kBlitLimY1] >= src.height ||
      p[kBlitLimX0] >= src.width || p[kBlitLimY0] >= src.height) {
    return "limites fora da fonte";
  }
  if (p[kBlitLimX0] != std::floor(p[kBlitLimX0]) || p[kBlitLimX1] != std::floor(p[kBlitLimX1]) ||
      p[kBlitLimY0] != std::floor(p[kBlitLimY0]) || p[kBlitLimY1] != std::floor(p[kBlitLimY1])) {
    return "limites não inteiros";
  }
  if (clipLength && clipLength < static_cast<size_t>(dst.width) * dst.height) return "clip menor que o destino";
  return nullptr;
}

void blitImage(const BlitTarget& dst, const BlitSource& src, const double* p,
               const uint8_t* clip, bool smooth) {
  const int bx0 = static_cast<int>(p[kBlitX0]);
  const int by0 = static_cast<int>(p[kBlitY0]);
  const int bx1 = static_cast<int>(p[kBlitX1]);
  const int by1 = static_cast<int>(p[kBlitY1]);
  const double* inv = p + kBlitInv;
  const double sx = p[kBlitSx];
  const double sy = p[kBlitSy];
  const double uMax = sx + p[kBlitSw];
  const double vMax = sy + p[kBlitSh];
  const Limits lim{p[kBlitLimX0], p[kBlitLimY0], p[kBlitLimX1], p[kBlitLimY1]};
  const double alpha = p[kBlitAlpha];
  const int sw = src.width;
  const int dw = dst.width;
  double one[4] = {0, 0, 0, 0};
  for (int y = by0; y < by1; y++) {
    const double py = y + kPixelCenter;
    const size_t base = static_cast<size_t>(y) * dw;
    double u = inv[0] * (bx0 + kPixelCenter) + inv[2] * py + inv[4];
    double v = inv[1] * (bx0 + kPixelCenter) + inv[3] * py + inv[5];
    for (int x = bx0; x < bx1; x++, u += inv[0], v += inv[1]) {
      if (u < sx || u >= uMax || v < sy || v >= vMax) continue;
      double c = alpha;
      if (clip) {
        const uint8_t m = clip[base + x];
        if (m == 0) continue;
        c *= m * kInvByte;
      }
      uint8_t* out = dst.data + (base + x) * kBytesPerPixel;
      if (smooth) {
        const double fx = u - kPixelCenter;
        const double fy = v - kPixelCenter;
        double xa = std::floor(fx);
        double ya = std::floor(fy);
        const double tx = fx - xa;
        const double ty = fy - ya;
        double xb = clampTo(xa + 1, lim.x0, lim.x1);
        double yb = clampTo(ya + 1, lim.y0, lim.y1);
        xa = clampTo(xa, lim.x0, lim.x1);
        ya = clampTo(ya, lim.y0, lim.y1);
        const size_t ra = static_cast<size_t>(ya) * sw;
        const size_t rb = static_cast<size_t>(yb) * sw;
        const uint32_t p00 = load32(src.data + (ra + static_cast<size_t>(xa)) * kBytesPerPixel);
        const uint32_t p10 = load32(src.data + (ra + static_cast<size_t>(xb)) * kBytesPerPixel);
        const uint32_t p01 = load32(src.data + (rb + static_cast<size_t>(xa)) * kBytesPerPixel);
        const uint32_t p11 = load32(src.data + (rb + static_cast<size_t>(xb)) * kBytesPerPixel);
        if (((p00 & p10 & p01 & p11) >> kAlphaShift) == kOpaque) {
          const double w00 = (1 - tx) * (1 - ty);
          const double w10 = tx * (1 - ty);
          const double w01 = (1 - tx) * ty;
          const double w11 = tx * ty;
          const double r = (p00 & kChannel) * w00 + (p10 & kChannel) * w10 + (p01 & kChannel) * w01 + (p11 & kChannel) * w11;
          const double g = ((p00 >> kShiftG) & kChannel) * w00 + ((p10 >> kShiftG) & kChannel) * w10 +
                           ((p01 >> kShiftG) & kChannel) * w01 + ((p11 >> kShiftG) & kChannel) * w11;
          const double bl = ((p00 >> kShiftB) & kChannel) * w00 + ((p10 >> kShiftB) & kChannel) * w10 +
                            ((p01 >> kShiftB) & kChannel) * w01 + ((p11 >> kShiftB) & kChannel) * w11;
          if (c >= 1) store32(out, packOpaque(r, g, bl));
          else blendPixel(out, r, g, bl, c);
          continue;
        }
        sampleBilinear(src, u, v, lim, one);
      } else {
        const double nx = clampTo(std::floor(u), lim.x0, lim.x1);
        const double ny = clampTo(std::floor(v), lim.y0, lim.y1);
        const uint32_t px = load32(src.data + (static_cast<size_t>(ny) * sw + static_cast<size_t>(nx)) * kBytesPerPixel);
        const uint32_t a = px >> kAlphaShift;
        if (a == 0) continue;  // transparente: nada a compor
        if (a == kOpaque && c >= 1) {
          store32(out, px);
          continue;
        }
        one[0] = px & kChannel;
        one[1] = (px >> kShiftG) & kChannel;
        one[2] = (px >> kShiftB) & kChannel;
        one[kAlpha] = a;
      }
      const double sa = c * one[kAlpha] * kInvByte;
      if (sa > 0) blendPixel(out, one[0], one[1], one[2], sa);
    }
  }
}

}  // namespace cortex2d
