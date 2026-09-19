# 0196 - Cache de preset de material, pré-aquecimento de pipeline e defaults de batching

**Data:** 2026-09-19
**Status:** aceito

## Contexto

O `kart-racer` (Circuito Capital, Brasília) roda a **15 fps no editor do Studio**
e sofre um **hitch de alguns frames ao iniciar a corrida**. O HUD mostra
"186 obj", mas a medição real da cena (`scenes/level.json` + os `.glb`) é outra:

| Métrica | Medido |
|---|---|
| Triângulos | 1.770.402 |
| Draw calls (sub-malhas) | 1.094 |
| Instâncias de material | 826 |
| Textura | 0 MB (vertex color / cor chapada) |

Com `outdoorLighting.csm: true` e `shadowCascades: 3`, esses 1.094 draws são
percorridos 4× por frame (principal + 3 cascatas) — ~4.400 draws/frame. O
gargalo é CPU (travessia + bindings do `WebGPURenderer`), não GPU: não há
textura para transferir.

Três causas estruturais na engine, todas fora do jogo:

1. **`applyMaterial` cria um material novo por malha, sem cache** — a cena
   declara `material: { type: 'toon', shading: 'cel' }` em cada nó, e
   `buildToon`/`buildUnlit` rodam por malha. As 34 árvores verdes idênticas
   viram 136 `MeshToonMaterial` distintos. Pior: cada um recebe uma
   `DataTexture` de rampa **própria** (`makeCelGradient`), ou seja, centenas de
   texturas idênticas de 256 bytes, cada uma com seu bind group. Como o
   `mergeStaticScene` agrupa **por material**, material único por malha
   **neutraliza o merge estático** da engine (SPEC-0120).
2. **Sem pré-aquecimento de pipeline.** O three compila o pipeline na primeira
   vez que um material entra em tela; no início da corrida, os carros e efeitos
   que ainda não haviam aparecido compilam todos no mesmo frame. O
   `compileAsync` existe, mas só é usado em `examples/bench-city`.
3. **`mergeStatic`/`renderBundles` têm default `false`** em `buildScene`
   ([SceneBuilder.ts](../../src/scene/SceneBuilder.ts)), e **nenhum** jogo passa
   as flags — inclusive o export nativo, onde o comentário do código já afirmava
   "liga no host nativo". Toda a infraestrutura validada no M-perf-2
   (ADR-0136: 19 → 59 fps no bench) está inerte nos jogos reais.

## Decisão

### 1. Cache de preset de material por (material original × config)

`applyMaterial` passa a consultar um cache antes de construir:

- Chave: a **referência** do material original (`WeakMap<Material, …>`) e uma
  **chave textual estável** da `MaterialConfig` (só os campos que afetam o
  material; `outline` fica de fora — é malha extra, não material).
- Malhas que compartilham o mesmo material de origem (o cache de `loadGLB` já
  compartilha geometria e material entre clones) e a mesma config recebem **a
  mesma instância** de material.
- A **rampa de tom** (`gradientMap`) vira singleton por config em um cache
  próprio (`cel` e `bands:N`), em vez de uma `DataTexture` por material.

Ciclo de vida: cada preset cacheado é marcado com `userData.cortexCached = true`,
então o `Scene.disposeAll` o preserva entre fases — mesma política dos assets
(SPEC-0152). `disposePreset` só dispõe material **fora** do cache (presets
antigos, criados antes desta mudança ou já substituídos). O despejo explícito
vem de `clearMaterialPresetCache()`, chamado por `clearSceneAssetCaches()`.

Consequência direta: com N malhas compartilhando material de origem, o número de
materiais cai de N para 1, e o `mergeStaticScene` volta a ter grupos reais para
fundir.

### 2. Pré-aquecimento de pipeline (`Renderer.precompile`)

`Renderer` ganha `precompile(scene, camera)`, que delega ao `compileAsync` do
three quando disponível (no-op onde não existe — testes com renderer mockado).
`buildScene` chama ao final quando recebeu `renderer` e `camera`, sob a opção
`precompile` (default **ligado**). `Game` expõe `precompile()` para o jogo
pré-aquecer o que cria **depois** do build (no `kart-racer`, os carros montados
por `createCar`).

O pré-aquecimento é assíncrono e não bloqueia o boot: o custo sai do primeiro
frame em que o objeto aparece e vai para o carregamento, onde já há loading.

### 3. `mergeStatic` e `renderBundles` ligados por default no host nativo

`options.mergeStatic ?? isNativeHost()` e o mesmo para `renderBundles` — o que o
comentário já prometia e o código não fazia. Browser e Studio seguem desligados:
o merge é destrutivo na cena viva e o editor F2 precisa dos objetos individuais.

## Consequências

- **Materiais compartilhados são compartilhados de verdade.** Editar o material
  de um objeto pelo Inspector continua funcionando (a config é por objeto e gera
  uma chave própria), mas dois objetos com a mesma config e o mesmo asset de
  origem passam a apontar para o mesmo material. Quem mutar uma propriedade do
  material **diretamente** (fora do `applyMaterial`) agora afeta todos os
  objetos que compartilham o preset — o caminho suportado continua sendo
  `applyMaterial` com uma config nova.
- **O merge estático volta a valer** em cena com preset de material, que era o
  caso de toda cena autorada com toon/unlit.
- **Export nativo passa a fundir e bundlar por default** — o comportamento que o
  M-perf-2 mediu (ADR-0136). Jogos que dependiam de objetos individuais em
  runtime no host (mover um nó estático por script) precisam passar
  `mergeStatic: false` explicitamente.
- O pré-aquecimento aumenta levemente o tempo de load em troca de eliminar o
  hitch de primeira aparição.
- Não altera nada dos itens ainda pendentes do diagnóstico: instancing
  automático de nós repetidos e filtro de shadow caster por distância continuam
  em aberto (candidatos a registro próprio se a medição indicar).

## Medição

Harness `examples/perf-kart` (`yarn dev:perf-kart`): monta o `level.json` do
`kart-racer` com esta árvore e reporta os contadores da cena montada. Rodado nos
dois lados (baseline = mesma árvore com as mudanças em stash), Chrome headless
com WebGPU:

| Métrica | Antes | Depois |
|---|---|---|
| Materiais distintos | 1816 | **1102** (−39%) |
| Texturas de rampa (`gradientMap`) | 989 | **2** (−99,8%) |
| Malhas | 1816 | 1816 |
| Draw calls / frame | 3562 | 3562 |
| Triângulos / frame | 8.083.172 | 8.083.172 |

**O que a medição mostra — e o que ela NÃO mostra.** O cache faz exatamente o que
promete (materiais e rampas), mas **não mexe nos draw calls**: são 3562 por
frame para 1094 sub-malhas, ou seja ~3,3 passes por objeto (principal + as 3
cascatas do CSM), e 8 M triângulos por frame. Esse é o custo dominante da cena e
ele continua de pé.

Dois caminhos ficam abertos, ambos agora **destravados** por esta spec (com
material compartilhado eles passam a ter o que agrupar):

1. **Instancing automático** de nós que repetem o mesmo `.glb` — 85 árvores de 3
   modelos são 340 draws que poderiam ser 3.
2. **Filtro de shadow caster** por distância/tamanho e menos cascatas — ~70% dos
   draws desta cena são das cascatas de sombra.

O fps não entra na tabela de propósito: medido em headless ele variou de 29 a 44
entre execuções da MESMA árvore, então não distingue as duas versões. O juiz de
fps é o Studio na máquina do usuário.
