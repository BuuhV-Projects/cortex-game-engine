# SPEC-0309 - Aquecimento com pipelines em paralelo

**Data:** 2026-10-07
**Status:** aceito

## Contexto

Ver ADR-0310. O quadro de aquecimento (ADR-0262) cria os pipelines de forma
síncrona; no navegador o Chrome os compila em série no processo de GPU depois que o
`precompile()` já voltou, e o 1º quadro do jogo congela atrás disso.

## Decisão

- `src/core/WarmupFrame.ts` ganha `drawWithParallelPipelines(threeRenderer, draw)`:
  roda `draw()` com `_pipelines.updateForRender` trocado por
  `getForRender(ro, promessas)`, restaura num `finally` e devolve as promessas.
  Sem `_pipelines.getForRender`/`updateForRender` (outra versão do three, mock),
  só desenha e devolve `[]`.
- `Game._renderWarmupFrame()` usa isso fora do host nativo (`isNativeHost()`) e
  devolve as promessas; `precompile()` espera `Promise.all` delas antes de coletar
  o lixo e registrar o evento `precompile` do trace. Funciona igual nos dois
  caminhos (loop parado: desenha na hora; loop rodando: pede o quadro ao loop).
- Teste: `tests/core/WarmupFrame.test.ts` — as promessas criadas no `draw` voltam,
  o `updateForRender` original é restaurado mesmo se o `draw` lançar, e sem
  `_pipelines` o `draw` roda e a lista é vazia.

## Consequências

- `game.precompile()` no navegador resolve com os pipelines compilados; jogo que
  revela logo depois não congela.
- Host nativo: sem mudança.

## Medição

(Detetive Brasília, Chrome headless com GPU, `?play=1&hora=10&clima=sol`)

(preenchida abaixo)
