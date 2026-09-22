// Aritmética do passe de sombra nativo (SPEC-0245, E5).
//
// Vive num header PRÓPRIO, sem wgpu, por um motivo só: assim o harness
// `cortex_host_tests` consegue exercitá-la. A regra de medição 2 da SPEC-0245
// manda validar o instrumento antes de concluir dele, e uma matriz errada aqui
// não daria erro nenhum — daria sombra no lugar errado, que é o tipo de falha
// que já custou dias nesta série.
#pragma once

#include <cstddef>

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

}  // namespace render
