# SPEC-0134 - Profiler de frame por-subsistema + contadores NAPI

**Data:** 2026-07-21
**Status:** aceito

## Contexto

Primeiro marco (M-perf-0) do PRD-0005 (capacidade open-world). O gargalo de
performance do host nativo já foi cercado por spikes manuais (ver
`.claude/plano-perf-render-nativo.md` e ADR-0122): pós Hermes upstream + clang-cl
a fase-1 do teste4 roda a 70-73 fps, e o custo dominante deixou de ser o
interpretador — passou a ser o **overhead por-chamada NAPI no caminho de render**
(cada método WebGPU que o `WebGPURenderer` invoca é uma travessia JS→C++ com
marshalling fixo).

O problema: esse diagnóstico veio de **medição manual de spike**, não de
instrumentação permanente. Não havia (1) breakdown de quanto do frame é
`world.tick` vs `render` vs `ui`, nem (2) contagem de quantas chamadas NAPI por
categoria acontecem por frame. Sem esse "juiz" no código, os cortes de perf das
fases seguintes do PRD-0005 (render bundles, streaming) não teriam critério de
aceite objetivo — só "pareceu mais rápido".

## Decisão

Duas peças de instrumentação permanente, ligadas **só** com o HUD de debug ativo
(custo ≈ zero quando desligado).

### 1. `FrameProfiler` (lado engine) — `src/core/FrameProfiler.ts`

Profiler por-subsistema com seções nomeadas (`begin(name)`/`end(name)`) e um
**ring buffer por seção** (janela default 240 frames ≈ 4 s a 60 fps) que deriva
**média** e **p99** (o p99 é o que importa pra hitching). O `commitFrame()` fecha
o frame jogando os acumuladores nos rings; seções não tocadas no frame entram
como `0` (rings em sincronia). O `Game._tick` instrumenta `input` / `update`
(onUpdate do jogo) / `world` (ECS+física) / `ui` (update+render) / `render`
(o if/else de câmera/postfx). Exposto em `game.profiler` pra ferramentas e o
benchmark do M-perf-1 lerem o breakdown.

- **Custo ≈ zero desligado:** `begin`/`end`/`commitFrame` retornam no 1º `if`.
  Fica ligado junto com o `DebugHud` (`export --debug`, `?cortexHud=1` ou o
  toggle do Studio) — `Game.setDebugHud` amarra `profiler.setEnabled` à
  visibilidade do HUD.
- **Relógio injetável** (`now`) pra teste determinístico.

### 2. Contadores NAPI/frame (lado nativo) — `native/src/webgpu/napi_stats.{h,cpp}`

Contadores `uint32` por categoria do draw-path (`setPipeline`, `setBindGroup`,
`setVertexBuffer`, `setIndexBuffer`, `draw`, `drawIndexed`, `writeBuffer`,
`submit`), incrementados por um `bump*()` inline no ponto onde cada método do
shim WebGPU dispara a chamada wgpu (`commands.cpp` e `buffers.cpp`). Single-thread
(só a thread JS), então `uint32` puro, sem atômico. O `runFrame` (`main.cpp`)
chama `resetNapiStatsFrame()` depois do present: snapshot do frame corrente →
"último frame completo" e zera o corrente. `__cortexNapiStats()` (registrado em
`registerBindings`) devolve o último frame completo — números estáveis, de um
frame inteiro, mesmo lido no meio de outro.

### HUD

`DebugHud` ganhou duas linhas: **prof** (`rnd`/`wld`/`ui` p99 em ms, do
`FrameProfiler` injetado) e **NAPI** (`draw`/`bind`/`pipe`/`wb` do
`__cortexNapiStats`). No browser (sem os shims) mostram `—` sem quebrar.

## Consequências

- Os marcos M-perf-2+ do PRD-0005 passam a ter critério objetivo: "chamadas NAPI
  de draw-path −80%", "render ≤8 ms" viram números lidos direto do HUD/`game.profiler`.
- Custo em produção é nulo (profiler desligado sem o HUD; contadores NAPI são um
  `++uint32` por chamada — desprezível, e sempre presentes por simplicidade).
- O `DebugHud` cresceu de 4 pra 6 linhas (painel maior); testes atualizados.
- Ainda **não há** um contador de tempo por-chamada NAPI (só contagem); medir o
  custo em ms de cada travessia fica pro M-perf-2, quando for o alvo do corte.
- O lado C++ (`napi_stats`, incrementos, reset, registro no CMake) foi
  **compilado e validado no host real** (2026-07-21, build incremental clang-cl):
  o `__cortexNapiStats()` reporta os contadores por frame no DebugHud e no
  benchmark (ADR-0135). O lado engine está coberto por Vitest + typecheck.
  Exemplo medido (bench-city, 2016 prédios): por frame ~211 `drawIndexed`, 234
  `setBindGroup`, 383 `setVertexBuffer`, 211 `setIndexBuffer`, 263 `writeBuffer`
  — o custo NAPI que o M-perf-2 vai cortar.
