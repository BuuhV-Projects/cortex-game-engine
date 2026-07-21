# SPEC-0140 - Bake offline da cidade (M-perf-4 follow-up)

**Data:** 2026-07-21
**Status:** aceito

## Contexto

Quinto marco do PRD-0005 (open-world). Depois do streaming de células (SPEC-0139),
o **load** ainda era lento: montar a cidade do bench (36 células / ~200 prédios)
levava **~22–31 s**. Medição provou que o gargalo NÃO é triângulo (decimar os
modelos a 25% cortou só ~30%) nem o pacote — é o **overhead por-prédio do
`buildScene`+merge rodando ~200× no Hermes sem JIT** (~75–110 ms/prédio: clone de
hierarquia, material/sombra, `computeBoundingSphere`, de-interleave, bake, merge).

Arquitetura correta (como GTA): **fundir/otimizar OFFLINE, runtime só carrega.**

## Decisão

### Bake offline — `examples/bench-city/bake-city.mjs` (Node)

Roda o MESMO `generateCityScene` do runtime (bundlado via esbuild, pra não
divergir), particiona a cidade em células (`CELL_SIZE = 90 m`) e, por
(célula, material), **funde a geometria dos prédios transformando os vértices pela
world matrix da instância** (`applyMatrix4` na posição, `normalMatrix` na normal).
Grava UM `city.glb` com um nó `cell-<key>` por célula + texturas COMPARTILHADAS
(1×, via `mergeDocuments`+`dedup`) + um manifesto `city-cells.json`
(`{cellSize, cells:[{key,x,z}]}`). É feito no nível de ACESSOR (typed arrays) — o
`join`/`flatten` de alto nível do gltf-transform não mantém células separadas.

### Runtime — `examples/bench-city/main.ts` + `cells.ts`

Carrega o `city.glb` UMA vez (`loadGLB`+`instance`), lê o manifesto e envolve cada
nó `cell-<key>` num `BundleGroup` (`wrapBakedCell`). O `CellStreamingSystem`
adiciona/remove por distância; o frustum culling do three corta o fora-de-tela;
os render bundles (SPEC-0136) cortam as travessias NAPI. **Sem buildScene/merge
por prédio em runtime** → load de dezenas de segundos vira ~9 s (o que resta é o
parse do glb monolítico — o overhead por-prédio SUMIU).

### Três armadilhas do host nativo resolvidas no caminho

1. **Prédios BRANCOS** — geometria com `COLOR_0` (vertex color) num
   `MeshStandardNodeMaterial` renderiza branca no host: o **naga** (WGSL do
   wgpu-native) miscompila o caminho vertex-color+map (o Dawn/browser tolera). O
   bake copia só `POSITION`/`NORMAL`/`TEXCOORD_0` (dropa `COLOR_0`/`TEXCOORD_1`).
2. **Mesh atravessando / espeto no céu** — o **renderer nativo renderiza errado
   buffer INTERLEAVED** (POSITION/NORMAL/UV num bufferView com byteStride →
   triângulos esticados gigantes). É a MESMA razão do `mergeStaticScene`
   de-interleavar (SPEC-0136). **Fix:** o bake grava o glb NÃO-interleaved
   (`io.setVertexLayout(VertexLayout.SEPARATE)` — o default do gltf-transform é
   INTERLEAVED). O runtime ainda chama `deinterleaveGeometry()` no `wrapBakedCell`
   como rede de segurança (no-op quando já separado). (Diagnóstico: o dado assado é
   100% limpo — sem NaN, índice em faixa, aresta < 150 m, transform identidade; o
   bug era só o layout no host.)
3. **Prédio distante transparente/buraco** — decimar (meshopt) os modelos, que já
   são low-poly (pré-decimados no `prepare-assets`), abre buracos nas paredes e
   estica triângulos. **Decisão: sem LOD de geometria** — perf de longe = culling
   + streaming + bundles. LOD de verdade pra esses assets seria impostor/billboard.

Materiais assados FOSCOS (só base color) por perf/tamanho — `CITY_KEEP_PBR=1`
mantém normal/ORM (mais lento). Flag `CORTEX_NO_COOK=1` no `export-game.mjs`
empacota os assets CRUS (PNG) — debug de textura KTX2.

## Consequências

- **Medido (bench-city, 36 células, host clang-cl, bundles ON + fosco +
  não-interleaved):** load 22–31 s → ~9 s; **orbit 71 fps** (render 20 ms),
  traverse ~60 fps. Cidade texturizada, sem espeto, sem buraco.
- **Próximo passo (load < 1 s):** streaming de BYTES por célula — 1 `.glb` por
  célula, o runtime carrega só as no raio (o que resta hoje é o parse do glb
  monolítico + compileAsync).
- **Os `city.glb`/`city-cells.json` são gerados** (não vão pro git — `.gitignore`).
  Rode `bake-city.mjs` após `prepare-assets.mjs`.
- **Vale pro teste4 e jogos reais:** asset com **vertex color** OU glb
  **interleaved** carregado direto (sem passar pelo merge) quebra no export nativo
  — evitar no asset, ou de-interleavar/dropar no carregamento.
