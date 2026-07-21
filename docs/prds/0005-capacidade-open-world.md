# PRD 0005 - Capacidade open-world (host nativo + engine)

**Data:** 2026-07-18
**Status:** planejado — nenhum marco iniciado. Este PRD registra o roadmap
completo (M-perf-0..5) para que a engine e o CortexNative suportem, quando o
jogo existir, um mundo-aberto escala GTA 3 (cidade ~4 km², streaming de
células, tráfego/pedestres, 60fps no host nativo). Continuação natural do
plano de perf executado em `.claude/plano-perf-render-nativo.md` (ADR-0122).

## Problema

Hoje um mundo-aberto não é viável no host nativo — e parcialmente nem no
browser — por quatro limites estruturais, todos já diagnosticados por medição
(spikes registrados em `.claude/plano-perf-render-nativo.md` e na seção
"Armadilhas conhecidas" de `docs/cortex-native/architecture.md`):

1. **Teto de CPU no render = custo por-chamada NAPI.** Pós ADR-0122 (Hermes
   upstream + clang-cl), a fase-1 do teste4 (~86 objetos) roda a 70-73 fps com
   render ~15-20 ms/frame. O interpretador deixou de ser o gargalo; o custo
   dominante são as N travessias JS→C++ (marshalling NAPI) por objeto por
   frame no shim WebGPU (`native/src/webgpu/commands.cpp`). Já descartados por
   spike: fill-rate (renderScale 1.0 vs 2.0 igual), vsync (Mailbox vs Fifo
   igual), draw calls (merge estático só +2 fps, SPEC-0121), física (~3 ms).
   Uma cidade multiplica objetos/materiais — esse custo fixo explode.
2. **Host single-thread total.** Física, render, decode de imagem e leitura de
   arquivo rodam todos na thread principal. Sem overlap, streaming de mundo
   causaria hitch proporcional ao tamanho do asset.
3. **Zero streaming pós-boot.** O `fetch` do host é síncrono
   (`native/js/src/shims/net.js` → `__cortexReadFile` lê o arquivo inteiro na
   main thread e devolve `Promise.resolve()`); o modelo atual é "`buildScene`
   carrega tudo, depois joga". Mundo de 4 km² não cabe nesse modelo.
4. **Cena plana, sem células/LOD/culling sistemático.** `SceneDefinition` é
   uma lista única de nós; `mergeStaticScene` é global (1 malha gigante piora
   frustum culling em mundo grande); não há LOD, spatial partitioning nem
   culling por distância. O culling é o por-objeto padrão do three.

Relacionados: ADR-0118 (raycast skinned + clamp dt), SPEC-0120/0121 (merge
estático), ADR-0122 (runtime Hermes upstream + clang-cl).

## O que já existe e será reaproveitado

- **`mergeStaticScene`** (SPEC-0120/0121) — merge por material, liga automático
  no host; vira merge **por célula** no M-perf-4.
- **Vegetação instanciada** (`src/scene/Vegetation.ts`, SPEC-0077) —
  `InstancedMesh` por sub-malha, instâncias serializadas na cena.
- **CSM + HDRI** (`OutdoorLighting`) — sombra que segue a câmera até 250 m,
  já pensada pra exterior grande.
- **assets.pak + KTX2** (ADR-0104/0108/0119) — cook com cache por hash;
  base do streaming de assets.
- **Hermes upstream estático + clang-cl** (ADR-0122) — runtime já otimizado;
  bytecode AOT compatível com console (sem JIT).
- **Base de render bundles no shim** — `deviceCreateRenderBundleEncoder` e
  `passExecuteBundles` já existem em `native/src/webgpu/commands.cpp` (usados
  pelos mipmaps do three); faltam só `setIndexBuffer`/`drawIndexed` no encoder.
- **three 0.184 exporta `BundleGroup`** (`three/webgpu`) — o
  `WebGPURenderer` grava o bundle uma vez e o replay vira 1 chamada
  `executeBundles` por pass, invalidação por `bundleGroup.version`.

## Roadmap

Dependências: **M-perf-0 → 1 → 2 (2a antes de 2b) → 3 → 4 → 5** (o 5 tem gate
por medição). Cada marco é útil sozinho, tem critério de aceite mensurável e
ganha ADR próprio na implementação. Tudo é validável no Windows dev; cada ADR
anota o que muda no Xbox/GDK (orçamentos de memória, limites de thread).

### M-perf-0 — Instrumentação permanente (SPEC-0134)

Sem juiz, nenhuma fase seguinte tem critério. Duas frentes:

- **Profiler por-subsistema**: `src/core/FrameProfiler.ts` novo (seções
  nomeadas, média móvel + p99 em ring buffer), envolvendo em `Game._tick`
  (`src/core/Game.ts`) gamepad / onUpdate / `world.tick` / ui / render;
  painel de breakdown no `src/ui/DebugHud.ts`.
- **Contadores NAPI/frame por categoria** (setPipeline, setBindGroup,
  setVertexBuffer, draw/drawIndexed, writeBuffer, queueSubmit): estender
  `native/src/shims/perf_stats.cpp` com incrementos de 1 linha nos métodos
  quentes de `commands.cpp`/`buffers.cpp` (estado C++ puro, sem alocar NAPI),
  snapshot via `__cortexNapiStats()`, zerado por frame em `runFrame`.

**Aceite:** breakdown em ms + contadores no HUD; overhead <0,2 ms/frame;
baseline da fase-1 do teste4 registrado por categoria.
**Riscos:** resolução do `performance.now` no Hermes (se grosseira, expor
timer nativo). **Testes:** `tests/core/FrameProfiler.test.ts` (clock fake,
seções aninhadas, p99).

### M-perf-1 — Benchmark cidade sintética + harness (ADR-0135) ✅ FEITO (2026-07-21)

> **Concluído:** `examples/bench-city/` (gerador determinístico + BenchRunner) +
> `native/scripts/bench.mjs`, usando **modelos `.glb` reais** (kit City Bench
> Test — prédios com PBR próximos de um GTA). **Baseline:** 64 prédios reais /
> 200 dinâmicos → ~19 fps, pior 1% ~16, **render p99 ~61 ms**; NAPI/frame ~1178
> drawIndexed + 1747 setBindGroup + 1794 setVertexBuffer (milhares de travessias
> JS→C++ — o alvo dos render bundles). O bench **descobriu um bug**: vegetação
> instanciada (`InstancedMesh` + `MeshStandardNodeMaterial`) gera WGSL que o naga
> (wgpu-native = host de export) rejeita → panic no `queueSubmit`; o Dawn
> (Studio) tolera. Ver ADR-0135 §achados (dois fixes: codegen upstream + host não
> dar panic em pipeline inválido).

Cena de estresse procedural e determinística, bem acima da fase-1:

- `examples/bench-city/`: gerador por seed de `SceneDefinition` grande
  (~2.000 nós estáticos, 40 materiais, 50k instâncias de vegetação, 200
  dinâmicos "tráfego") + entry mínimo; roda no browser e exporta pro host
  pelo pipeline normal (`native/scripts/export-game.mjs`, sem mudanças).
- Harness: trilho de câmera com warmup, coleta do FrameProfiler, saída
  `[bench]{fps_avg, fps_p1, ms_por_subsistema, napi_calls}` no stdout;
  `native/scripts/bench.mjs` exporta, roda o host, parseia e guarda histórico
  pra comparar marcos.

**Aceite:** variação entre execuções ≤5% (seed fixa; present mode e
renderScale fixados no bench). **Testes:** gerador determinístico (mesma seed
⇒ mesma definição; contagens batem com params).

### M-perf-2 — Corte do custo NAPI do render (SPEC-0136)

- **2a (quick win)**: cache de estado por pass no shim — guardar último
  pipeline/bindgroup/vertex buffer por slot no objeto do pass e retornar cedo
  em chamada redundante. Zero mudança no three.
- **2b (corte estrutural)**: render bundles. Shim: adicionar
  `bundleSetIndexBuffer` + `bundleDrawIndexed` espelhando as versões do pass e
  registrá-los no encoder; stubs com warning pra qualquer método ausente
  (crash silencioso é a armadilha). Engine: envolver o estático fundido e os
  `InstancedMesh` de vegetação num `BundleGroup`, atrás de
  `BuildSceneOptions.renderBundles` (default ligado no host, como
  `mergeStatic`) em `src/scene/StaticMerge.ts` + `src/scene/SceneBuilder.ts`.

**Aceite:** chamadas NAPI de draw-path −80% na porção estática do bench;
render da fase-1 ≤8 ms; bench ≥60 fps (meta ajustada com o baseline do
M-perf-1).
**Armadilhas:** shadow pass do CSM (bundle extra por cascade; se houver
artefato de sombra, fallback = excluir sombra do bundle); invalidação exige
`bundleGroup.needsUpdate` em edição de estático; entidades dinâmicas ficam
fora do bundle; interação do release de bundle com `flushDeferredDestroys`.
**Plano B** (se o caminho de bundles do three 0.184 se mostrar imaturo em cena
real): ficar com 2a + comando agregado — JS acumula comandos num TypedArray
(handles por tabela de ids) e 1 chamada NAPI drena tudo; patch no objeto pass
do shim, sem tocar no three.

### M-perf-3 — IO assíncrono + thread pool (SPEC-0137)

- `native/src/core/io_pool.{h,cpp}`: pool de 2-4 workers + fila de conclusões
  drenada em `runFrame` (`main.cpp`). **Regra de ouro: nenhuma chamada NAPI
  fora da thread JS** — workers só produzem bytes; a resolução do
  `napi_deferred` e a criação do ArrayBuffer acontecem no drain, na main.
- `__cortexReadFileAsync` em `files.cpp` (Promise real); variantes async do
  decode em `image_decode.cpp`/`ktx2.cpp` (decode no pool, wrap no main);
  `net.js` prefere o async quando existir, mantendo o caminho síncrono do
  boot intacto; join do pool antes do teardown do Hermes.

**Aceite:** `fetch` de um KTX2 grande em pleno gameplay com hitch <2 ms na
main thread; checksum async == sync. **Riscos:** leitura concorrente do
assets.pak XOR (handle por worker ou mutex em `pak.cpp`); ordem de shutdown
(worker resolvendo depois do env morto — drenar/descartar no destructor).

### M-perf-4 — Células, streaming e LOD (SPEC-0138 + ADR-0139)

Data-driven e editável no Studio, funcionando também no browser:

- `SceneDefinition`: bloco opcional `streaming: { cellSize, origin, radius }`
  + célula por nó (explícita ou derivada da posição) e `lod: [{ model,
  maxDistance }]` por nó (validação em `validateScene`).
- `SceneBuilder`: `buildCell(cellId)` / `disposeCell(cellId)` incrementais;
  `mergeStaticScene` escopado **por célula** (cada célula: 1-N merges + 1
  `BundleGroup` do M-perf-2); colliders por célula.
- `src/scene/Streaming.ts`: `CellStreamingSystem` (ECS, priority antes do
  render) — distância + histerese, orçamento de ms/frame (time-slicing) e
  fila priorizada por distância/direção da câmera.
- LOD via `three.LOD` + culling por distância sistemático (raio por tipo de
  nó) como primeiro corte barato.
- Editor F2/Studio: sem merge nem streaming no modo editor (padrão atual —
  merge só no host), edição grava na célula do nó.

**Aceite:** bench reconfigurado como 4 km² em células (ex. 128 m), residentes
só num raio R; hitch p99 de load/unload <4 ms; 60 fps no host; browser ok;
Inspector/F2 seguem editando objetos individuais.
**Riscos:** descarte de célula × handles GPU (`flushDeferredDestroys`);
colliders de borda entre células; hitch de compile de pipeline na primeira
aparição de material novo (pré-aquecer materiais no boot); `Vegetation`
passa a ter capacity por célula.

### M-perf-5 — Rota A: shermes tipado (anotação, sem detalhar)

Quando, **pós M-perf-2**, o custo dominante migrar do NAPI pro JS puro
(visível no FrameProfiler), avaliar Static Hermes AOT **tipado** — análogo ao
IL2CPP da Unity, permitido no console (AOT, zero codegen em runtime). Spike já
feito: untyped rende só 1,4× (não vale); o ganho prometido é do modo tipado.
**Gate de entrada:** `world.tick + JS do render > 8 ms` no bench com NAPI já
cortado. Detalhes na seção "Rota A" de `.claude/plano-perf-render-nativo.md`.

## Resumo dos marcos

| Marco | Entrega | Critério de aceite | ADR |
|---|---|---|---|
| M-perf-0 | FrameProfiler + contadores NAPI no HUD | overhead <0,2 ms; baseline fase-1 registrado | 0134 |
| M-perf-1 | `examples/bench-city/` + `bench.mjs` | variação ≤5% entre execuções | 0135 |
| M-perf-2 | cache de estado no shim + render bundles | NAPI draw-path −80%; render fase-1 ≤8 ms; bench ≥60 fps | 0136 |
| M-perf-3 | io_pool + fetch assíncrono real | hitch <2 ms com fetch mid-gameplay | 0137 |
| M-perf-4 | células + `CellStreamingSystem` + LOD | 4 km²; hitch p99 <4 ms; 60 fps host | 0138/0139 |
| M-perf-5 | (gate) shermes tipado | só se JS >8 ms pós M-perf-2 | futuro |

## Fora de escopo deste PRD

Sistemas de **jogo** de mundo-aberto — tráfego, pedestres, navegação/navmesh,
missões — são conteúdo do jogo (ou milestones futuros próprios), não do host.
Este PRD entrega a **capacidade**: render que escala, IO que não trava e cena
que carrega por região.
