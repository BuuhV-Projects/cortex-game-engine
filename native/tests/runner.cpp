// Runner dos testes unitários do host (TDR-0004): registra as funções de
// teste dos *_test.cpp e devolve o nº de falhas como exit code.
#include "harness.h"

namespace tests {
void testFormatFromString();
void testFormatToStringRoundtrip();
void testBc7Math();
void testAppendPerfLog();
void testDescribeCurrentException();
void testGameConfig();
void testSceneMirrorPropagaTransformDoPai();
void testSceneMirrorRecusaArvoreForaDeOrdem();
void testSceneMirrorCortaPeloFrustum();
void testSceneMirrorIgnoraIndiceForaDaCena();
void testSceneMirrorNaoRecalculaQuemNaoMudou();
void testPipelineCacheCriaUmaVezPorChave();
void testPipelineCacheSeparaChavesDiferentes();
void testPipelineCacheNaoCriaNadaEmRegime();
void testPipelineCacheClearEsqueceTudo();
void testUniformPoolAlinhaOsSlots();
void testUniformPoolEscreveSoQuemMudou();
void testUniformPoolNaoDuplicaMarcacao();
void testUniformPoolFrameParadoNaoEscreveNada();
void testUniformPoolCenaNovaMarcaTudo();
void testUniformPoolIgnoraSlotForaDaFaixa();
void testRenderListOpacosAntesDeTransparentes();
void testRenderListAgrupaOpacosPorPipeline();
void testRenderListTransparentesDeTrasParaFrente();
void testRenderListEstavelParaEmpate();
void testRenderListVaziaNaoQuebra();
}  // namespace tests

int main() {
  tests::testFormatFromString();
  tests::testFormatToStringRoundtrip();
  tests::testBc7Math();
  tests::testAppendPerfLog();
  tests::testDescribeCurrentException();
  tests::testGameConfig();
  tests::testSceneMirrorPropagaTransformDoPai();
  tests::testSceneMirrorRecusaArvoreForaDeOrdem();
  tests::testSceneMirrorCortaPeloFrustum();
  tests::testSceneMirrorIgnoraIndiceForaDaCena();
  tests::testSceneMirrorNaoRecalculaQuemNaoMudou();
  tests::testPipelineCacheCriaUmaVezPorChave();
  tests::testPipelineCacheSeparaChavesDiferentes();
  tests::testPipelineCacheNaoCriaNadaEmRegime();
  tests::testPipelineCacheClearEsqueceTudo();
  tests::testUniformPoolAlinhaOsSlots();
  tests::testUniformPoolEscreveSoQuemMudou();
  tests::testUniformPoolNaoDuplicaMarcacao();
  tests::testUniformPoolFrameParadoNaoEscreveNada();
  tests::testUniformPoolCenaNovaMarcaTudo();
  tests::testUniformPoolIgnoraSlotForaDaFaixa();
  tests::testRenderListOpacosAntesDeTransparentes();
  tests::testRenderListAgrupaOpacosPorPipeline();
  tests::testRenderListTransparentesDeTrasParaFrente();
  tests::testRenderListEstavelParaEmpate();
  tests::testRenderListVaziaNaoQuebra();
  return testing::summary();
}
