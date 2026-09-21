// Testes da RenderList (M4 do ADR-0237).
#include "../src/render/render_list.h"

#include "harness.h"

namespace {

render::RenderItem item(int32_t node, uint64_t pipeline, float depthSq, bool transparent) {
  render::RenderItem it;
  it.node = node;
  it.pipelineKey = pipeline;
  it.depthSq = depthSq;
  it.transparent = transparent;
  return it;
}

}  // namespace

namespace tests {

void testRenderListOpacosAntesDeTransparentes() {
  // O transparente depende do depth que os opacos escreveram.
  std::vector<render::RenderItem> lista = {
      item(1, 10, 5.0f, true),
      item(2, 10, 1.0f, false),
      item(3, 20, 2.0f, true),
      item(4, 20, 3.0f, false),
  };

  render::sortRenderList(lista);

  CHECK(!lista[0].transparent);
  CHECK(!lista[1].transparent);
  CHECK(lista[2].transparent);
  CHECK(lista[3].transparent);
}

void testRenderListAgrupaOpacosPorPipeline() {
  // Trocar pipeline é o que custa no encoder; com 5 pipelines na cena, agrupar
  // deixa praticamente uma troca por grupo.
  std::vector<render::RenderItem> lista = {
      item(1, 20, 0.0f, false),
      item(2, 10, 0.0f, false),
      item(3, 20, 0.0f, false),
      item(4, 10, 0.0f, false),
  };

  render::sortRenderList(lista);

  CHECK(lista[0].pipelineKey == 10);
  CHECK(lista[1].pipelineKey == 10);
  CHECK(lista[2].pipelineKey == 20);
  CHECK(lista[3].pipelineKey == 20);
}

void testRenderListTransparentesDeTrasParaFrente() {
  // Aqui a ordem não é desempenho, é imagem correta.
  std::vector<render::RenderItem> lista = {
      item(1, 10, 1.0f, true),
      item(2, 10, 9.0f, true),
      item(3, 10, 4.0f, true),
  };

  render::sortRenderList(lista);

  CHECK(lista[0].depthSq == 9.0f);
  CHECK(lista[1].depthSq == 4.0f);
  CHECK(lista[2].depthSq == 1.0f);
}

void testRenderListEstavelParaEmpate() {
  // Dois opacos do mesmo pipeline mantêm a ordem da cena. Sem estabilidade, a
  // ordem mudaria entre frames e produziria diferença sutil sem causa aparente.
  std::vector<render::RenderItem> lista = {
      item(7, 10, 0.0f, false),
      item(3, 10, 0.0f, false),
      item(5, 10, 0.0f, false),
  };

  render::sortRenderList(lista);

  CHECK(lista[0].node == 7);
  CHECK(lista[1].node == 3);
  CHECK(lista[2].node == 5);
}

void testRenderListVaziaNaoQuebra() {
  std::vector<render::RenderItem> lista;
  render::sortRenderList(lista);
  CHECK(lista.empty());
}

}  // namespace tests
