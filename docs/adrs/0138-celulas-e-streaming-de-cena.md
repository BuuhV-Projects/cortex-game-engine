# ADR-0138 - Células e streaming de cena

**Data:** 2026-07-21
**Status:** aceito

## Contexto

Quinto marco (M-perf-4) do PRD-0005 — o que efetivamente entrega o mundo-aberto.
Os marcos anteriores fizeram uma cidade caber a 60fps (render bundles + merge,
M-perf-2) e o IO sair da thread (M-perf-3). Mas o custo ainda escala com o
**tamanho do mundo**: montar uma cidade de 4 km² inteira não cabe (memória, build,
traversal). Um GTA resolve isso carregando só um **raio ao redor do jogador**.

## Decisão

**Streaming de células** (`src/scene/Streaming.ts`): o mundo é particionado numa
grade; só as células dentro de um raio da câmera ficam **residentes** na cena. O
custo de render passa a depender do **raio**, não do tamanho do mundo.

`CellStreamingSystem` (System do ECS, priority bem baixa → roda antes do render):
- **Lógica pura e testável** (`step(cameraXZ)`): descarrega residentes além de
  `raio + histerese` (a histerese evita thrash na borda); carrega, por distância
  e até um **orçamento por frame** (espalha o custo), as células dentro do raio.
- O **build/dispose de verdade é do app** (callbacks `onLoad`/`onUnload`), porque
  montar uma célula é `buildScene` dos nós dela — o engine só orquestra QUANDO.
  Reusa os predicados de dinamismo do merge (não streama player/script/animado).

**Regra de carga por RAIO, não por frustum:** carrega inclusive atrás da câmera.
Num open-world o jogador gira a câmera na hora; carregar só o cone de visão faria
pop-in ao virar. O frustum culling (automático no three) cuida de *não desenhar*
o que está fora da tela; o streaming cuida de *ter carregado* o entorno.

**Merge/bundle POR CÉLULA:** cada célula é montada com `mergeStatic` +
`renderBundles` próprios — assim descarregar uma célula libera os grupos dela. É
menos eficiente que o merge global (M-perf-2), mas é o que permite o unload.

**Pré-aquecimento de pipeline (armadilha resolvida):** a 1ª vez que uma célula
aparece, o wgpu **compila** o shader e trava o frame (~250 ms medido). Fix:
montar todas as células no boot + `renderer.compileAsync` + remover as
não-residentes — a compilação vira custo único de boot; o streaming depois
adiciona/remove sem hitch.

## Consequências

- **Medido (bench, cidade de 196 prédios em 36 células), dois testes de câmera
  (ambos válidos num GTA — tem avião e tem andar a pé):**
  - **orbit** (sobrevoo/avião): 13/36 residentes, **70 fps**, render 13 ms — de
    cima o LOD faz os distantes virarem proxy;
  - **traverse** (anda pela rua): 12/36 residentes, **69 fps**, render 12 ms — as
    células entram/saem do raio conforme anda (o streaming trabalhando).
  Sem streaming (todas as 36 residentes): ~36 fps. O ganho é manter poucas
  células residentes — e é **independente do tamanho do mundo**: uma cidade 4×
  maior manteria ~12 residentes e o mesmo fps, enquanto sem streaming colapsaria.
- **Câmera baixa (traverse) é o que EXERCITA o streaming:** um sobrevoo alto vê a
  cidade toda (pouco a descartar); andar a pé vê um entorno local. Ambos rodam em
  sequência no bench (`[bench:orbit]` / `[bench:traverse]`).
- **Carga sob demanda: tentada, cara demais (2026-07-21) → PRÉ-BUILD + splash +
  progresso.** Montar a célula SOB DEMANDA (no `onLoad`, quando entra no raio)
  dava boot rápido, mas **travava o jogo** (~260 ms/frame): o
  de-interleave+merge+bundle de uma célula é trabalho pesado na thread JS (Hermes,
  sem worker pra three) — o orbit, expondo células novas o tempo todo, ficava a
  ~1 fps. O `traverse` (revisita células em cache) ficava suave. Como o custo de
  build é alto, a decisão foi **pré-montar no boot** (o jogo só gera dados DEPOIS
  da splash da engine, que cobre o tempo) e o streaming só ADICIONA/REMOVE (barato)
  — 70 fps suave. Um **feedback de progresso** (`[loading] montando cidade N/36`,
  via `onProgress`/`loadingCount` do `CellStreamingSystem`) alimenta a tela de
  carregamento do dev.
- **API assíncrona pronta pro futuro:** o `onLoad` já aceita Promise e o sistema
  expõe `loadingCount`/`onProgress`/`isResident` — quando o build de célula ficar
  barato (build incremental espalhado por frames, ou decode/merge off-thread — o
  follow-up do M-perf-3), dá pra voltar pra carga sob demanda sem tocar na lógica
  de residência.
- Sem o pré-aquecimento, o load de célula dava ~250 ms de hitch (worst-1% 3.6
  fps). Com ele: worst-1% > 60.
- **Editor F2/browser:** o streaming (como o merge) é do host — no Studio a cena
  fica inteira pra edição.
- LOD (longe = low-poly) é o complemento — ADR-0139.
- O bench passou a usar cidade grande (14×14) + tráfego realista (40) pra o
  streaming importar; os números de M-perf-2/3 eram numa cena menor.
