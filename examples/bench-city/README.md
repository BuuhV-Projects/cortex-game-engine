# bench-city — benchmark de render open-world (M-perf-1 / ADR-0135)

Cena de estresse determinística com **modelos `.glb` reais** (kit "City Bench
Test": prédios com geometria + PBR próximos de um GTA) pra medir o custo de
render do host nativo — o "juiz" dos cortes de perf do PRD-0005.

## Rodar

```sh
# 1) gerar os .glb dos prédios do pack-fonte (uma vez — os .glb não vão pro git)
node examples/bench-city/prepare-assets.mjs
#    (opcional: passe o caminho do export glTF do pack como argumento)

# 2) exportar + rodar + medir (grava histórico e compara com a última execução)
node native/scripts/bench.mjs
#    --no-export  reusa o dist-native já gerado
#    --timeout N  segundos de espera pela linha [bench]
```

Requer o host nativo buildado (`native/build/cortex_host.exe`) — ver
`docs/cortex-native/architecture.md`.

## Peças

- `generate.ts` — gera a `SceneDefinition` determinística por `seed` (grade de
  prédios `.glb`). Pura e testável (`tests/examples/benchCityGenerator.test.ts`).
- `BenchRunner.ts` — trilho de câmera + warmup + mede N frames → linha
  `[bench]{fpsAvg, fpsP1, ms por subsistema, napi}`.
- `main.ts` — "jogo" real pro pipeline de export (monta a cena, adiciona o
  tráfego dinâmico, roda o bench, encerra via `__cortexQuit`).
- `prepare-assets.mjs` — converte os prédios do pack-fonte em `.glb`.
- `assets/models/*.glb` — **não versionado** (pesado); gerado pelo passo 1.

## Escalar a carga

Edite `DEFAULT_BENCH_CITY` em `generate.ts` (`rows`, `spacing`, `traffic`) ou
defina `globalThis.__cortexBenchParams` antes de carregar (browser).
