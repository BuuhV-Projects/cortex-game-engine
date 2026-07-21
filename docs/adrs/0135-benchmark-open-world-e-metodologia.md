# ADR-0135 - Benchmark open-world (cidade sintética) e metodologia

**Data:** 2026-07-21
**Status:** aceito

## Contexto

Segundo marco (M-perf-1) do PRD-0005. O M-perf-0 (SPEC-0134) deu o "juiz" por
frame (FrameProfiler + contadores NAPI), mas medir sempre a fase-1 do teste4 não
representa a carga de um mundo-aberto: ~86 objetos é pouco, e depende de assets
externos. Os cortes de perf das fases seguintes (render bundles no M-perf-2,
streaming no M-perf-4) precisam de uma cena de estresse **grande, determinística
e sem assets**, medida por um harness reproduzível — senão "ficou mais rápido" é
só impressão.

## Decisão

Uma **cena de cidade sintética** parametrizável + um **harness de medição** que
roda no host de export e emite um relatório de máquina.

### Gerador — `examples/bench-city/generate.ts`

`generateCityScene(params)` produz uma `SceneDefinition` **determinística por
`seed`** (RNG mulberry32 puro) usando **modelos `.glb` reais** (kit "City Bench
Test": prédios Large/Medium/Small com ~18-45k tris e 12-13 materiais PBR cada —
geometria/materiais/texturas próximos de um GTA, muito mais representativo que
primitivas). Nós: chão + `rows²` prédios `.glb` (ciclando os 3 por RNG, rotação
de 90° variada). `params`: `rows`, `spacing`, `traffic`. Default: 8×8 → **64
prédios** (~2M tris). Mesma seed → cena idêntica (testado em `tests/examples/`).
Os `.glb` são pesados (~40 MB, não versionados) — `prepare-assets.mjs` os gera do
pack-fonte antes do 1º run (ver `README.md`).

### Harness — `examples/bench-city/{main.ts,BenchRunner.ts}`

O `main.ts` é um "jogo" real pro pipeline de export (só `main.ts`, sem assets):
monta a cena, adiciona o "tráfego" (caixas dinâmicas fora do merge) e roda o
`BenchRunner`, que dirige a câmera num trilho circular, descarta um warmup, mede
N frames e emite **uma linha `[bench]{…}`** com `fpsAvg`, `fpsP1` (pior 1%), o
p99 por subsistema do FrameProfiler e os contadores NAPI. Ao terminar, encerra
via `__cortexQuit`.

### Orquestrador — `native/scripts/bench.mjs`

Exporta o `bench-city` pelo pipeline normal (`export-game.mjs`), roda o
`launcher.exe`, coleta a linha `[bench]`, grava em `native/bench-history.jsonl`
(com git sha) e imprime um resumo comparando com a execução anterior. É o passo
a rodar **antes e depois** de cada marco pra medir o ganho real.

### Baseline medido (2026-07-21, host clang-cl com contadores NAPI)

Config default (64 prédios `.glb` reais, 200 tráfego): **~19 fps médio, ~16 fps
no pior 1%, render p99 ~61 ms** — pesada e claramente **render-bound** (lógica/UI
< 2 ms), como um GTA de verdade. Contadores NAPI por frame (o teto que o M-perf-2
vai derrubar): ~**1178 `drawIndexed`, 1747 `setBindGroup`, 1794 `setVertexBuffer`,
1041 `setIndexBuffer`, 752 `setPipeline`, 277 `writeBuffer`, 5 `submit`** — vários
milhares de travessias JS→C++ por frame, cada uma com marshalling fixo. É
exatamente esse volume que os render bundles (M-perf-2) colapsam num punhado de
chamadas.

> Nota: uma variante anterior usava primitivas (2016 caixas) e dava ~50 fps /
> render ~22 ms — leve demais e pouco representativa. Trocada por modelos reais
> a pedido (bench "de verdade").

## Consequências

- Os marcos seguintes têm alvo objetivo: rodar `bench.mjs` antes/depois e ler o
  delta de `fpsAvg`/`render p99`/`napi` no histórico.
- A cena é asset-free → o bench roda em qualquer máquina/CI com o host buildado,
  sem depender de `.glb`/`.pak`.
- Variação entre execuções do **mesmo** binário fica dentro do esperado; entre
  builds/estados de máquina diferentes pode variar mais (anotar o contexto).

### Achado: vegetação instanciada quebra o export nativo (bug descoberto pelo bench)

Ao subir a vegetação, o host **crasha** (panic em `wgpuQueueSubmit`). Causa raiz
(do `error_log.txt`): qualquer `InstancedMesh` com `MeshStandardNodeMaterial`
gera um WGSL que o **naga** (compilador do wgpu-native, o host de export)
**rejeita** — `wgpuDeviceCreateShaderModule` → *"Index 32 is out of bounds for
expression [69]"*. O shader inválido deixa o pipeline inválido, e o host **dá
panic no submit** em vez de pular. O **Dawn** (Studio/browser) tolera o MESMO
shader — por isso jogos que usam vegetação (ex.: DDD-61-CORTEX) rodam no Studio
mas quebrariam no export nativo. Não é regressão de versão (three 0.184 estável
desde maio); é interop three-codegen × naga-strictness.

São **dois** problemas, ambos fora do escopo do M-perf-1:
1. **Codegen (upstream three):** o WGSL do material instanciado. Mitigação
   possível: patch/flag no three, ou um caminho de material naga-safe pra
   instâncias.
2. **Robustez do host:** `wgpuQueueSubmit` **não deveria dar panic** num
   pipeline inválido — deveria logar e pular (hoje derruba o processo). Fix no
   host C++ (wgpu-native error scope / validar antes do submit).

Por isso a config default do bench nasce com `vegetation: 0`. O gerador/harness
já suportam vegetação (o parâmetro existe) — subir o número volta a exercitar o
instancing assim que (1) e/ou (2) forem resolvidos, o que merece um marco
próprio.
