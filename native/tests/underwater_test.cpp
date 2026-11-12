// Efeito embaixo d'água do host (SPEC-0726): o estado que chega do JS é limitado
// à faixa do shader e o uniform carrega a fase reduzida a uma volta.
#include "../src/webgpu/underwater_params.h"

#include <cmath>
#include <limits>

#include "harness.h"

namespace tests {
namespace {

constexpr float kEps = 1e-5f;
constexpr double kTwoPi = 6.283185307179586;

bool near(float a, float b) { return std::fabs(a - b) < kEps; }

}  // namespace

void testUnderwaterSanitizeLimitaAFaixa() {
  webgpu::UnderwaterState in;
  in.amount = 2.0f;
  in.tint = -1.0f;
  in.brightness = std::numeric_limits<float>::quiet_NaN();
  in.amplitude = -0.5f;
  in.frequency = std::numeric_limits<float>::infinity();
  in.speed = 1.5f;
  in.r = 1.5f;
  in.g = 0.25f;
  in.b = -3.0f;
  const webgpu::UnderwaterState s = webgpu::sanitizeUnderwater(in);
  CHECK(near(s.amount, 1.0f));
  CHECK(near(s.tint, 0.0f));
  CHECK(near(s.brightness, 1.0f));  // NaN vira o neutro (sem escurecer)
  CHECK(near(s.amplitude, 0.0f));
  CHECK(near(s.frequency, 0.0f));
  CHECK(near(s.speed, 1.5f));
  CHECK(near(s.r, 1.0f) && near(s.g, 0.25f) && near(s.b, 0.0f));
  CHECK(webgpu::underwaterActive(s));
}

void testUnderwaterPackDaFaseEmUmaVolta() {
  webgpu::UnderwaterState s;
  s.amount = 0.5f;
  s.speed = 1.5f;
  s.r = 0.2f;
  s.g = 0.4f;
  s.b = 0.6f;
  // Uma hora de jogo: em float puro a fase (5400 rad) perderia a precisão do seno.
  const double seconds = 3600.0;
  const webgpu::UnderwaterUniform u = webgpu::packUnderwater(s, seconds);
  CHECK(u.phase >= 0.0f && u.phase < static_cast<float>(kTwoPi));
  CHECK(std::fabs(std::sin(u.phase) - std::sin(seconds * 1.5)) < 1e-4);
  CHECK(near(u.amount, 0.5f));
  CHECK(near(u.color[0], 0.2f) && near(u.color[1], 0.4f) && near(u.color[2], 0.6f));
  CHECK(near(u.color[3], 1.0f));
  s.speed = -1.5f;  // velocidade negativa: fase continua em [0, 2π)
  const webgpu::UnderwaterUniform back = webgpu::packUnderwater(s, seconds);
  CHECK(back.phase >= 0.0f && back.phase < static_cast<float>(kTwoPi));
}

void testUnderwaterDesligadoEZerado() {
  const webgpu::UnderwaterState off;
  CHECK(!webgpu::underwaterActive(off));
  const webgpu::UnderwaterUniform u = webgpu::packUnderwater(off, 10.0);
  CHECK(near(u.amount, 0.0f));  // o shader devolve a cor e a UV intactas
  CHECK(sizeof(webgpu::UnderwaterUniform) == 48);
}

}  // namespace tests
