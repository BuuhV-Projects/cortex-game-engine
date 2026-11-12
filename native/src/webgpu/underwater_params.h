// Efeito de tela embaixo d'água (SPEC-0726, ADR-0727): estado e empacotamento do
// uniform do blit final. PURO (sem wgpu nem NAPI), testado no cortex_host_tests.
//
// O JS manda o estado já resolvido (`resolveUnderwater` em src/core/underwater.ts);
// aqui só se limita o que o shader não pode receber fora da faixa e se calcula a
// fase da onda pelo relógio do host.
#pragma once

#include <cstddef>

namespace webgpu {

/** Estado resolvido que chega por `__cortexUnderwater`. `amount` 0 = desligado. */
struct UnderwaterState {
  float amount = 0.0f;      // 0..1
  float tint = 0.0f;        // 0..1
  float brightness = 1.0f;  // 1 (raso) .. 0 (preto)
  float amplitude = 0.0f;   // fração da largura da tela
  float frequency = 0.0f;   // rad por altura de tela
  float speed = 0.0f;       // rad por segundo
  float r = 0.0f;           // cor da água em sRGB, 0..1
  float g = 0.0f;
  float b = 0.0f;
};

/** Casa com `Underwater` do WGSL do blit: 8 floats + vec4 = 48 B. */
struct UnderwaterUniform {
  float amount;
  float tint;
  float brightness;
  float amplitude;
  float frequency;
  float phase;  // fase por tempo já multiplicada pela velocidade, em [0, 2π)
  float pad0;
  float pad1;
  float color[4];
};
static_assert(sizeof(UnderwaterUniform) == 48, "uniform do blit embaixo d'água tem 48 B");

/** Limita os campos à faixa do shader (NaN vira o neutro). */
UnderwaterState sanitizeUnderwater(const UnderwaterState& in);

/** O efeito está ligado (vale escrever o uniform)? */
bool underwaterActive(const UnderwaterState& s);

/** Uniform do quadro, com a fase `fmod(seconds · speed, 2π)`. */
UnderwaterUniform packUnderwater(const UnderwaterState& s, double seconds);

}  // namespace webgpu
