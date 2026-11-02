# SPEC-0665 — Tempo de GPU do pass-timing em ticks convertidos

**Data:** 2026-11-02
**Status:** implementado

## Contexto

O pass-timing do host (SPEC-0254) lê os timestamps de GPU dos passes e grava `pass-timing` e `gpu-work` no
`perf-log.txt`. Ele tratava o valor do timestamp como nanossegundos, mas o wgpu-native entrega o valor **cru** da
GPU (o `WGPUInstanceFlag_AutomaticTimestampNormalization` não está ligado). No DX12 da AMD RX 6600 o relógio é de
100 MHz, então cada tick vale 10 ns e o log mostrava a GPU 10 vezes mais leve.

No DDD 00 isso escondeu o gargalo: o log dizia 12 ms de GPU por quadro, enquanto o contador do Windows mostrava a
GPU a 97% e o `present` esperava 60–90 ms pela GPU.

## Decisão

`setupPassTiming` lê `wgpuQueueGetTimestampPeriod` (ns por tick) uma vez e toda conversão para ms passa por
`msDeTicks` (percentis do `gpu-work`, ms por origem e a linha por passe). O período lido vai para o log
(`pass-timing: N ns por tick do timestamp`), para ninguém precisar adivinhar a unidade.

## Consequências

- No DDD 00, a mesma rodada passa a mostrar `gpu-work med=139 ms`, coerente com o `present` e com o contador do
  Windows.
- Números de GPU de medições anteriores feitas numa GPU com período diferente de 1 estão subestimados pelo
  fator do período.
