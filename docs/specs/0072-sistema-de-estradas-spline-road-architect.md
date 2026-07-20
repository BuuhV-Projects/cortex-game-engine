# SPEC-0072 - Sistema de estradas por spline (inspirado no Road Architect)

**Data:** 2026-06-22
**Status:** aceito — em implementação por fases (`src/road/`, nó `road`, editor)

## Contexto

Falta no engine uma ferramenta de **estradas** (open-world/driving). A referência é o
**Road Architect** (MicroGSD, **MIT**) usado no DDD-61 em Unity: estradas por **spline**
(nós Catmull-Rom) que geram a malha da pista com largura/faixas/acostamento, conformam ao
terreno, e ainda fazem interseções, pontes, túneis, guard-rails, placas e semáforos
(~7k linhas só no core C#).

**Porte 1:1 do C# é inviável e desalinhado** — o engine é WebGPU/TSL, ECS, e **cena =
DADO** (ADR-0044). Mas os **conceitos, a matemática (spline + ribbon mesh + UV) e as
texturas** portam bem — exatamente como o ProBuilder (SPEC-0071) trouxe blockout pro modelo
data-driven. A licença MIT permite **copiar texturas e portar a lógica** (mantendo o
aviso de copyright da MicroGSD).

## Decisão

### Nó de cena `road` (data-driven; overlay vence)
Uma estrada é DADO: a spline + parâmetros. O `buildScene` gera a malha; o editor F2
autora a spline (adicionar/mover/inserir nós), overlay vence (igual ao `mesh`/SPEC-0071).

```ts
roadNode = {
  type: 'road',
  id: string,
  nodes: Vec3[],            // pontos de controle da spline (metros)
  width?: number,           // largura da pista (default 8 m ≈ 2 faixas)
  surface?: RoadSurface,    // 'asphalt'|'concrete'|'dirt'|'brick'|'cobblestone' | {diffuse,normal,repeat}
  conformTerrain?: boolean, // a pista acompanha a altura do terreno (raycast por amostra)
  yOffset?: number,         // levanta a pista acima do chão (evita z-fight). Default 0.05
  // (fases futuras: shoulderWidth, lanes, markings, flattenTerrain, ...)
  ...baseFields             // transform, collider, material…
}
```

### Núcleo puro (`src/road/`, testável, sem editor/ECS)
- **`RoadSpline.ts`** — Catmull-Rom pelos `nodes`: amostra posição + tangente a cada passo
  (densidade por segmento). Puro/testável.
- **`RoadMesh.ts`** — `roadRibbon(samples, width)` → faixa (ribbon) de triângulos: por
  amostra, vértices esquerda/direita = `pos ± right·(width/2)` (`right = tangent × up`).
  UV: U atravessa a largura (0..1), V ao longo do comprimento (por distância → tile).
  `toRoadGeometry` monta a `BufferGeometry` (posições/normais/UV).

### Conformar ao terreno (Fase 1)
O `buildScene` (`makeRoad`), com `conformTerrain`, faz **raycast pra baixo** contra o
terreno em cada amostra e fixa o Y da pista em `terrenoY + yOffset`. (Achatar o terreno
embaixo da pista fica pra Fase 2 — mexe no heightmap/TerrainAuthoring.)

### Material + texturas (MIT, copiadas)
Superfícies do Road Architect (asfalto/concreto/terra/tijolo/paralelepípedo + normais)
viram **assets do projeto** (`assets/roads/…`). Um catálogo (`ROAD_SURFACES`) mapeia nome
amigável → diffuse/normal/repeat. `surface` aceita o nome ou URLs explícitas. Sem textura
= cor de asfalto sólida (a geometria funciona sozinha). Aviso MIT preservado.

### Editor F2 (autoria da spline)
- **Desenhar estrada**: clicar pontos no terreno pra traçar a spline (reusa o padrão do
  `ShapeDrawSystem`), Enter/duplo-clique/Esc finaliza → cria o nó `road` em `data.added`.
- **Editar nós**: handles nos nós da spline (`RoadEditSystem`, padrão do `MeshEditSystem`) —
  **mover** (feito): arrasta o ponto, regenera a pista ao vivo e o terreno se reajusta ao
  soltar (cut & fill). Inserir/remover nó ainda não. Edita estradas de `data.added`.

### Roadmap (fases)
1. **MVP (esta):** nó `road` + spline + ribbon + textura + conformar terreno + desenhar/
   editar spline no F2 + colisão (dirigível). Testes do core.
2. Achatar terreno sob a pista (**cut & fill** — feito no [ADR-0075](../adrs/0075-estrada-molda-terreno-cut-and-fill.md):
   greide suavizado + o terreno se adapta à pista, não-destrutivo); largura/faixas;
   **marcação** (linha central/laterais); acostamento/sarjeta.
3. **Interseções** (T/X), rampas, pontes/elevado.
4. Props ao longo da spline: guard-rails (extrusão), placas, semáforos (portar
   meshes/texturas).

## Consequências

- **`src/road/` novo** (spline + mesh) — puro, testável, reusável (a IA do Chat pode gerar
  nós `road`). Segue o molde do `src/probuilder/` (SPEC-0071).
- **Texturas (MIT)** copiadas pro projeto (`assets/roads/`) — **65 MB** se trazer o pack
  inteiro; considerar Git LFS/curadoria se pesar no repo.
- **Reusa padrões do editor** (draw tool, edição de elementos, `cortexSolid` p/ colisão).
- **Fora de escopo na Fase 1:** interseções, pontes, túneis, placas, semáforos, achatar
  terreno — abrir ADR/registro próprio por fase.
- **API pública nova** (nó `road`, `src/road/`) → `yarn docs:engine`, atualizar
  `engine-api.md`/`architecture.md`, re-vendorizar.
```
