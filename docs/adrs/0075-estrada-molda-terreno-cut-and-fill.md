# 0075 - Estrada molda o terreno (cut & fill + talude)

**Data:** 2026-06-27
**Status:** aceito — implementa a **Fase 2** do [SPEC-0072](../specs/0072-sistema-de-estradas-spline-road-architect.md)

## Contexto

Na Fase 1 do SPEC-0072 a relação pista↔terreno era **a pista obedece**: `conformTerrain`
faz raycast por vértice e crava a malha da pista em `terrenoY + yOffset`. A pista vira uma
**toalha jogada por cima do relevo** — herda toda a rugosidade do terreno. Numa encosta
íngreme ou num relevo acidentado, a estrada fica ondulada/torta, seguindo cada bossa
(observado na prática: personagem numa ladeira com a pista deformada colada no morro).

A relação correta de uma estrada de verdade é **o inverso**: a estrada tem um **greide**
(perfil de elevação suave) e o **terreno se adapta a ela** — *cut & fill* (engenharia
rodoviária): **corta** o terreno onde ele está acima da pista, **aterra** onde está abaixo,
com um **talude** (rampa de transição) nas laterais pra não virar um paredão vertical. O
próprio SPEC-0072 já previa isso ("Achatar o terreno embaixo da pista fica pra Fase 2 — mexe
no heightmap/TerrainAuthoring").

## Decisão

### Modo por estrada (dado da cena, editável no Inspector)
Novo campo `terrainMode` no nó `road`:
- `'conform'` (**default**, retrocompatível): comportamento da Fase 1 (a pista se deforma).
- `'cutfill'`: o terreno se adapta à pista. Acompanham `taludeWidth` (largura da transição
  por lado, default 6 m) e `maxSlope` (inclinação máx. do greide, **default 0.25 = 25%**).

> **Nota (2026-06-27):** o default do `maxSlope` nasceu 0.08 (8%, realista pra rodovia),
> mas na prática **aplainava morros inteiros** — o greide manso não conseguia subir a
> elevação, então o cut & fill escavava tudo. Subimos pra **0.25 (25%)**: a estrada
> **sobe o morro fazendo ladeira** (escava só um canal da largura da pista, mantendo o
> resto do relevo). É editável por estrada no Inspector ("Inclinação máx. (%)") — baixe
> pra pista mais plana/drivável, suba pra acompanhar mais a montanha.

Segue a regra do CLAUDE.md (física/relação = **dado**, editável no Inspector, overlay vence)
— não é comportamento cravado em código.

### Greide suavizado **automático** (`src/road/RoadGrade.ts`, puro)
`smoothGrade(samples, terrainY, {maxSlope, smoothMeters})`: amostra a altura do terreno sob
cada amostra do eixo e gera o perfil de elevação da pista — **média móvel** (em metros, não
em índice, porque a tessellation é adaptativa) pra alisar bossas + **clamp de inclinação**
(passes pra frente e pra trás) pra limitar rampas. "Põe a estrada e o relevo se ajeita"
(pouca autoria manual). *(Alternativa considerada: greide pelos Y dos nós da spline — mais
controle, mais trabalho; descartada como default por exigir autoria fina.)*

### Moldagem do terreno (`moldHeightfield`, puro)
Para cada vértice da grade do terreno: acha o ponto mais próximo do eixo da pista + o greide
ali. Dentro de `halfWidth + ombro` (**platô**) → **greide** (corta/aterra); no `taludeWidth`
seguinte → `smoothstep` do greide até a base; fora → base. Devolve o **delta** (alvo − base).
`mergeDeltas` combina várias estradas (vence o de maior magnitude no vértice compartilhado).

**Ombro (acostamento) — evita vão na borda:** a grade do terreno costuma ser mais grossa
que a pista, então sem isso o vértice logo fora da borda cai no talude e o terreno
**descola da pista** (vão/penhasco na beira — observado na prática). O platô (terreno no
nível do greide) estende-se além da borda por `max(shoulder, ~1,5 célula da grade)`,
garantindo que a borda da pista sempre caia sobre terreno colado no nível do greide.

### Não-destrutivo (recalculado a cada build)
O `Terrain` ganha **base + delta**: `heights` continua sendo a **base autorada** (e
`getHeights()`/serialização **não muda** — a cicatriz da estrada **não** é salva no
heightmap), e um `roadDelta` separado é somado pro **mesh e a colisão** (`heightAt` inclui o
delta; o player anda sobre o terreno moldado). `setRoadMolding(delta|null)` aplica/limpa.

O `buildScene`, no post-pass `moldTerrainToRoads` (depois de tudo posicionado), recalcula o
delta a partir das splines `cutfill` e chama `setRoadMolding`. **Mover/remover a estrada
re-ajeita o terreno** no próximo build, sem cicatriz. O editor (`RoadAuthoring`) chama o
post-pass ao vivo ao trocar modo/talude/largura.

## Consequências

- **`src/road/RoadGrade.ts` novo** (puro, testável) — segue o molde de `RoadSpline`/`RoadMesh`.
  Exportado no runtime (`smoothGrade`, `moldHeightfield`, `mergeDeltas`, tipos).
- **`Terrain` agora tem base+delta** — `getHeights` permanece a base (serialização intacta);
  mesh/`heightAt` usam base+delta. `sculpt`/`setHeights` re-aplicam o delta.
- **Retrocompatível**: sem `terrainMode`, tudo segue como `'conform'` (Fase 1).
- **Limitação de ordem** (mesma da Fase 1): o greide da pista é calculado em `applyRoad`,
  que precisa do terreno já na cena (terreno antes da estrada — caso normal; o editor
  sempre satisfaz). Sem terreno no momento, a estrada não molda.
- **Pista plana na largura** nesta fase (sem *banking*/superelevação nas curvas) — abrir
  registro próprio se for fazer.
- **Fora de escopo**: interseções/pontes (continuam Fase 3+ do SPEC-0072), superelevação.
- **API pública nova** → `yarn docs:engine`, `engine-api.md`/`architecture.md` atualizados,
  re-vendorizar os projetos-jogo de teste.
