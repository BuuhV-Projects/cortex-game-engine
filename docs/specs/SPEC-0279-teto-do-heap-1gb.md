# SPEC-0279 - Teto do heap do Hermes em 1 GB

**Data:** 2026-09-25
**Status:** aceito

## Contexto
Decisão e medições no ADR-0278: o export do crash-bandicoot-racer estourava o teto de
512 MB na fusão estática da carga.

## Decisão
- `native/src/core/hermes_embed.cpp`: `kMaxHeapBytes = 1u << 30` (1 GB), mesmo valor em
  todos os alvos. O resto do `GCConfig` (callback de analytics) não muda.
- Aceite: o export do crash-bandicoot-racer COM fusão estática (`mergeStatic` no padrão
  do host) carrega sem `HermesGC: OOM`, e o `perf-trace` mostra fps/draws medidos.

## Consequências
- Precisa rebuildar o host (`native/build*`) e reexportar os jogos para valer.
- Jogo que passar de 1 GB de memória externa volta a morrer na carga — o `error_log.txt`
  mostra `HermesGC: OOM ... external = N`.
