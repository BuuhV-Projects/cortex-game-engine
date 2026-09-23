// Aritmética do passe de sombra nativo (SPEC-0245, E5).
//
// Vive num header PRÓPRIO, sem wgpu, por um motivo só: assim o harness
// `cortex_host_tests` consegue exercitá-la. A regra de medição 2 da SPEC-0245
// manda validar o instrumento antes de concluir dele, e uma matriz errada aqui
// não daria erro nenhum — daria sombra no lugar errado, que é o tipo de falha
// que já custou dias nesta série.
#pragma once

#include <cstddef>
#include <cstdint>

#include "../scene/scene_mirror.h"

namespace render {

/** Elementos de uma matriz 4x4. */
constexpr int kShadowMatrixElements = 16;
/** Lado da matriz. */
constexpr int kShadowMatrixSide = 4;

/**
 * `saida = viewProj × model`, coluna-maior (a convenção do `three`), com a
 * conta feita em `double` e só o RESULTADO convertido para `float`.
 *
 * A ordem da conta é o ponto: multiplicar depois de converter cada fator para
 * `float` perde precisão na escala de uma cidade e devolve as bandas da
 * SPEC-0234. Converter no fim mantém os dígitos onde eles importam — na
 * diferença entre dois vértices próximos.
 *
 * @param viewProj 16 doubles, coluna-maior
 * @param model    16 doubles, coluna-maior
 * @param saida    16 floats, coluna-maior
 */
inline void shadowModelViewProjection(const double* viewProj, const double* model, float* saida) {
  for (int coluna = 0; coluna < kShadowMatrixSide; coluna++) {
    for (int linha = 0; linha < kShadowMatrixSide; linha++) {
      double soma = 0.0;
      for (int k = 0; k < kShadowMatrixSide; k++) {
        soma += viewProj[k * kShadowMatrixSide + linha] * model[coluna * kShadowMatrixSide + k];
      }
      saida[coluna * kShadowMatrixSide + linha] = static_cast<float>(soma);
    }
  }
}

/**
 * Como o passe nativo corta a face de um caster.
 *
 * Os três valores são os do WebGPU (`WGPUCullMode_{Back,Front,None}`), mas o
 * enum é próprio para esta unidade continuar sem `webgpu.h` — é o que a deixa
 * dentro do harness `cortex_host_tests`, onde a tabela do `three` é conferida.
 */
enum class ShadowCull : uint8_t { kBack = 0, kFront = 1, kNone = 2 };

/**
 * Determinante da parte 3x3 (rotação e escala) de uma matriz coluna-maior.
 *
 * Só a 3x3 porque a matriz de mundo de um nó é afim (última linha `0 0 0 1`) e
 * aí o determinante 4x4 é igual ao da 3x3 — que é o que o `three` consulta em
 * `matrixWorld.determinant()` para decidir o sentido da face.
 */
inline double shadowModelDeterminant(const double* model) {
  const double a = model[0], b = model[1], c = model[2];
  const double d = model[4], e = model[5], f = model[6];
  const double g = model[8], h = model[9], i = model[10];
  return a * (e * i - f * h) - d * (b * i - c * h) + g * (b * f - c * e);
}

/**
 * `cullMode` de um caster, a partir do lado EFETIVO do passe de sombra.
 *
 * Reproduz o que o backend WebGPU do `three` faz com `material.side`
 * (`WebGPUPipelineUtils._getPrimitiveState`): ele não muda o `cullMode`, e sim
 * o SENTIDO da face — `flipSided = (side === BackSide)`, invertido de novo
 * quando `matrixWorld.determinant() < 0`, com `cullMode` sempre `Back` (exceto
 * `DoubleSide`, que vira `None`). O pipeline daqui fixa `frontFace = CCW`, e
 * "CW + corta o de trás" é a mesma coisa que "CCW + corta o da frente" — então
 * o sentido vira escolha de `cullMode`, sem um pipeline a mais por sentido.
 *
 * Um {@link scene::kShadowSideUnsupported} nunca deveria chegar aqui (o gate
 * recusa o frame antes); se chegar, devolve {@link ShadowCull::kNone}, que
 * desenha os dois lados — o erro menos destrutivo possível, porque sombra a
 * mais é visível e sombra faltando não é.
 *
 * @param shadowSide valor de {@link scene::ShadowSide}, resolvido no JS
 * @param model      matriz de mundo do nó, coluna-maior
 */
inline ShadowCull shadowCullMode(uint8_t shadowSide, const double* model) {
  if (shadowSide == scene::kShadowSideDouble) return ShadowCull::kNone;
  if (shadowSide == scene::kShadowSideUnsupported) return ShadowCull::kNone;
  const bool ladoDeTras = shadowSide == scene::kShadowSideBack;
  const bool espelhado = model != nullptr && shadowModelDeterminant(model) < 0.0;
  // XOR: escala espelhada troca o sentido da face, exatamente como o
  // `flipSided` do `three` faz.
  return (ladoDeTras != espelhado) ? ShadowCull::kFront : ShadowCull::kBack;
}

}  // namespace render
