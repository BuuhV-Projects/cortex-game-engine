#include "underwater_params.h"

#include <cmath>

namespace webgpu {
namespace {

constexpr double kTwoPi = 6.283185307179586;

float clamp01(float v) {
  if (!std::isfinite(v)) return 0.0f;
  return v < 0.0f ? 0.0f : (v > 1.0f ? 1.0f : v);
}

float finiteOr(float v, float fallback) { return std::isfinite(v) ? v : fallback; }

}  // namespace

UnderwaterState sanitizeUnderwater(const UnderwaterState& in) {
  UnderwaterState s;
  s.amount = clamp01(in.amount);
  s.tint = clamp01(in.tint);
  s.brightness = std::isfinite(in.brightness) ? clamp01(in.brightness) : 1.0f;
  const float amplitude = finiteOr(in.amplitude, 0.0f);
  s.amplitude = amplitude < 0.0f ? 0.0f : amplitude;
  s.frequency = finiteOr(in.frequency, 0.0f);
  s.speed = finiteOr(in.speed, 0.0f);
  s.r = clamp01(in.r);
  s.g = clamp01(in.g);
  s.b = clamp01(in.b);
  return s;
}

bool underwaterActive(const UnderwaterState& s) { return s.amount > 0.0f; }

UnderwaterUniform packUnderwater(const UnderwaterState& s, double seconds) {
  UnderwaterUniform u{};
  u.amount = s.amount;
  u.tint = s.tint;
  u.brightness = s.brightness;
  u.amplitude = s.amplitude;
  u.frequency = s.frequency;
  // A fase cresce sem limite com o tempo; em float ela perderia precisão em
  // minutos. Reduzida a uma volta em double, o seno do shader dá o mesmo valor.
  double phase = std::fmod(seconds * static_cast<double>(s.speed), kTwoPi);
  if (phase < 0.0) phase += kTwoPi;
  u.phase = static_cast<float>(phase);
  u.color[0] = s.r;
  u.color[1] = s.g;
  u.color[2] = s.b;
  u.color[3] = 1.0f;
  return u;
}

}  // namespace webgpu
