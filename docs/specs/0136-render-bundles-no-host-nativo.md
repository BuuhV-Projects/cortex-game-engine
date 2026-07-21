# SPEC-0136 - Render bundles do estático no host nativo

**Data:** 2026-07-21
**Status:** aceito

## Contexto

Terceiro marco (M-perf-2b) do PRD-0005. O benchmark realista (ADR-0135) isolou o
gargalo de render do host nativo: numa cidade de 64 prédios `.glb`, ~**1178
`drawIndexed` + 1742 `setBindGroup` + 1798 `setVertexBuffer` por frame**, cada um
uma travessia JS→C++ (marshalling NAPI) com custo fixo. O `world.tick`/UI somam
< 2 ms — é tudo render (~61 ms, ~19 fps).

Duas hipóteses foram testadas:
- **M-perf-2a (cache de estado no shim):** rejeitada por medição — zero ganho, o
  backend do three já deduplicata estado no lado JS (ver PRD-0005).
- **Merge estático (SPEC-0121):** não ajuda aqui — os `.glb` reais usam buffers
  **interleaved**, que o `mergeGeometries` não funde (`attributeKey` retorna
  `null`), então os prédios ficam todos como malhas individuais.

O corte tem que atacar as travessias NAPI **em si**, não o custo de driver.

## Decisão

**Render bundles do WebGPU** (`GPURenderBundle`) pra a geometria ESTÁTICA. O
`WebGPURenderer` grava os comandos de draw das malhas estáticas **uma vez** num
bundle; nos frames seguintes o replay vira **1 `executeBundles`** por pass — as
milhares de chamadas por-objeto (setPipeline/BindGroup/VertexBuffer/draw) somem
do hot-path.

### Lado nativo — `native/src/webgpu/commands.cpp`

O encoder de bundle já existia (`deviceCreateRenderBundleEncoder`) mas só
registrava `setPipeline`/`setBindGroup`/`setVertexBuffer`/`draw`/`finish`.
Adicionados **`bundleSetIndexBuffer` + `bundleDrawIndexed`** (espelham as versões
do render pass) — sem eles, geometria indexada (a maioria) quebra a gravação.

### Lado engine — `src/scene/StaticMerge.ts` + `SceneBuilder.ts`

Nova função `wrapStaticInBundle(root, world?, extraDynamicRoots?)`: coleta as
subárvores **estáticas** top-level e as reparenta (via `Object3D.attach`, que
preserva o world transform) num `BundleGroup` (`three/webgpu`). **Diferente do
merge, NÃO exige geometria fundível** — bundla qualquer estático, inclusive
`.glb` interleaved. Ficam FORA: entidades dinâmicas (ECS/script), animados,
skinned, água/vegetação/veículo, luzes/câmeras (reusa os mesmos predicados do
merge: `dynamicRoots`, `isExcludedByUserData`, `isSkinned`).

Exposta em `BuildSceneOptions.renderBundles` (default `false`; o host liga junto
do merge). Roda DEPOIS do merge, pra bundlar também as malhas fundidas.

### Peça 2 do corte: merge lida com interleaved (de-interleave)

Os render bundles cortaram os DRAWS, mas o `WebGPURenderer` ainda **projeta/culla
cada objeto todo frame** (main + shadow), no Hermes sem JIT — com 785 sub-malhas
de prédio isso ainda dava ~35 ms. O merge estático (SPEC-0121) resolveria (785 →
~36 grupos), mas rejeitava os `.glb` reais por serem **interleaved**. Agora o
`mergeStaticScene` **de-interleava** a geometria antes de fundir
(`deinterleaveGeometry`, muta in-place; `applyMatrix4` já transforma
posição/normal/**tangente**, então normal map fica correto no bake). Merge +
bundle juntos derrubam a contagem de objetos E o custo de draw.

## Consequências

- **Medido (bench-city, 64 prédios `.glb`, host clang-cl):** só bundle: FPS
  19→37, render 61→35 ms. **Bundle + merge (de-interleave): FPS 19 → ~59 (3×),
  render p99 → ~22 ms** — o avg cola no cap de vsync (60). NAPI/frame **drawIndexed
  1188 → 126 (−89%)**, **setBindGroup 1742 → 132 (−92%)**, **setPipeline 737 → 4**.
  O resto (worst-1% ~48 fps) é `writeBuffer` do tráfego (200 dinâmicos) + hitches
  de GC — alvos do M-perf-3 (IO async) e de contagens realistas de veículos.
- **Estático assumido:** o `BundleGroup` grava a estrutura uma vez. Mudar a
  geometria estática exige reconstruir a cena (novo `buildScene`) — igual ao
  merge, já é o modelo do host. Editor F2 (browser) não liga bundles.
- **Sem artefato de sombra** observado na cena de teste (render limpo, sem
  `error_log`). Se aparecer em cena com CSM, o fallback é excluir os
  shadow-casters do bundle.
- **Reparenting:** `attach` move as subárvores pra dentro do `BundleGroup`. A
  física/BVH já derivou dos nós ANTES (o bundle roda por último) e o raycast
  desce no grupo, então colisão segue funcionando. No browser/Studio o bundle
  fica desligado (editor precisa dos objetos no lugar).
- Vale pra QUALQUER jogo com cenário estático no host — não só o bench.
