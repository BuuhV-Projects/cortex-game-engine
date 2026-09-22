// Testes da aritmetica do passe de sombra nativo (SPEC-0245, E5).
//
// Uma matriz errada aqui nao daria erro nenhum: daria sombra no lugar errado,
// ou bandas. A regra de medicao 2 da SPEC-0245 manda validar o instrumento num
// caso de resposta conhecida ANTES de concluir dele — e o caso de resposta
// conhecida de uma multiplicacao de matrizes e a propria conta, feita a mao.
#include "../src/render/shadow_math.h"

#include <cmath>

#include "harness.h"

namespace {

/** Erro tolerado ao comparar floats de uma conta feita em double. */
constexpr float kTolerancia = 1.0e-5f;

bool perto(float a, float b) { return std::fabs(a - b) <= kTolerancia; }

/** Matriz identidade, coluna-maior. */
const double kIdentidade[16] = {1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1};

/** Translacao pura, coluna-maior (a translacao fica na ULTIMA coluna). */
void translacao(double x, double y, double z, double* fora) {
  for (int i = 0; i < 16; i++) fora[i] = kIdentidade[i];
  fora[12] = x;
  fora[13] = y;
  fora[14] = z;
}

}  // namespace

namespace tests {

void testShadowMvpIdentidade() {
  double model[16];
  translacao(3, -4, 5, model);
  float saida[16] = {};
  render::shadowModelViewProjection(kIdentidade, model, saida);
  for (int i = 0; i < 16; i++) CHECK(perto(saida[i], static_cast<float>(model[i])));
}

void testShadowMvpOrdemImporta() {
  // `viewProj x model` NAO comuta: com a ordem trocada a translacao da camera
  // entraria no espaco do objeto e a sombra sairia deslocada. Duas translacoes
  // comutam entre si, entao o caso usa ESCALA de um lado e translacao do outro.
  double escala[16];
  for (int i = 0; i < 16; i++) escala[i] = kIdentidade[i];
  escala[0] = 2.0;
  escala[5] = 2.0;
  escala[10] = 2.0;

  double model[16];
  translacao(1, 0, 0, model);

  float direto[16] = {};
  render::shadowModelViewProjection(escala, model, direto);
  // Escala DEPOIS da translacao: o ponto (1,0,0) vira (2,0,0).
  CHECK(perto(direto[12], 2.0f));

  float trocado[16] = {};
  render::shadowModelViewProjection(model, escala, trocado);
  // Translacao depois da escala: o ponto fica em (1,0,0).
  CHECK(perto(trocado[12], 1.0f));
}

void testShadowMvpPontoConhecido() {
  // Caso de resposta conhecida: uma ortografica simples em coluna-maior, com o
  // objeto deslocado, e o vertice na origem local. O resultado e conferido
  // aplicando a matriz a mao ao ponto (0,0,0,1) — que e exatamente a ULTIMA
  // COLUNA da matriz final.
  double viewProj[16];
  for (int i = 0; i < 16; i++) viewProj[i] = kIdentidade[i];
  viewProj[0] = 0.5;   // 1/ (metade da largura)
  viewProj[5] = 0.25;  // 1/ (metade da altura)
  viewProj[10] = -0.1;
  viewProj[14] = 0.5;  // deslocamento em z (WebGPU: 0..1)

  double model[16];
  translacao(4, 8, -10, model);

  float saida[16] = {};
  render::shadowModelViewProjection(viewProj, model, saida);
  CHECK(perto(saida[12], 2.0f));                 // 4 * 0.5
  CHECK(perto(saida[13], 2.0f));                 // 8 * 0.25
  CHECK(perto(saida[14], 0.5f + 1.0f));          // -10 * -0.1 + 0.5
  CHECK(perto(saida[15], 1.0f));
}

void testShadowMvpMantemPrecisaoDeCidade() {
  // O motivo de a conta ser em double: a 800 m da origem, dois vertices a 1 mm
  // um do outro. Em float32 a diferenca desapareceria na soma; feita em double
  // e convertida so no fim, ela sobrevive na saida.
  const double kDistancia = 800.0;
  const double kMilimetro = 0.001;

  double a[16];
  translacao(kDistancia, 0, 0, a);
  double b[16];
  translacao(kDistancia + kMilimetro, 0, 0, b);

  float saidaA[16] = {};
  float saidaB[16] = {};
  render::shadowModelViewProjection(kIdentidade, a, saidaA);
  render::shadowModelViewProjection(kIdentidade, b, saidaB);
  CHECK(saidaA[12] != saidaB[12]);
}

}  // namespace tests
