# SPEC-0664 — Heap do Hermes no perf-trace

**Data:** 2026-11-02
**Status:** implementado

## Contexto

O perf-trace tinha os totais do coletor (`gc`: coletas jovens e completas, alocado acumulado), mas não o tamanho do
heap nem a memória externa. Sem isso, as 77 coletas completas do DDD 00 pareciam vir do código por quadro, e a
causa real (1,8 GB de ArrayBuffers contra um teto de 2 GB, ADR-0663) ficou escondida.

## Decisão

Cada amostra do perf-trace ganha `heap: {heapMB, allocMB, externalMB}`, lido de
`HermesInternal.getInstrumentedStats()` (`js_heapSize`, `js_allocatedBytes`, `js_externalBytes`). Fora do Hermes
(navegador, Studio, testes) o campo não aparece. Custo: uma chamada por amostra (2×/s).

## Consequências

- Medir memória do export não exige sonda temporária. `externalMB` perto do teto (ADR-0663) é o sinal de que o GC
  vai entrar em coleta contínua.
- `D:/ai-scripts/port-hollow/nativo-perf/report.mjs` imprime a linha `heap:`.
