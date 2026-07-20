# 0089 - Remoção dos subsistemas Road e Kit (enxugar a engine)

**Data:** 2026-06-29
**Status:** aceito (remove Road — SPEC-0072/0075/0076/0087/0088 — e Kit — ADR-0053)

## Contexto

Auditoria de maturidade (a pedido: "melhor pouco recurso com propósito claro do que muita coisa
que não serve de nada"). Dois subsistemas saíram **sem dono**:

- **Road** (`src/road/` + nó `road` + autoria do editor): a geometria procedural foi abandonada
  (ADR-0088 → Blender), e a base (spline→fita) tinha **um único consumidor, o DDD-61**, que
  migrou pro Blender. Nenhum outro projeto (platformer 2.5D, top-down farm) usa via por spline.
- **Kit** (`src/scene/Kit.ts` + campo `attach` + presets de collider/sprite por `role`): sistema
  de vocabulário/manifesto `kit.json` (ADR-0053) **inútil no momento** — nenhum projeto ativo usa.

## Decisão

**Remover ambos por completo.** Engine mais enxuta, sem caminhos mortos.

- **Road:** apagados `src/road/*` (9 arquivos), `RoadDrawSystem`/`RoadEditSystem`/`RoadAuthoring`,
  o nó `road` (`SceneDefinition`) + `makeRoad`/`applyRoad`/`makeProfiledRoad`/`moldTerrainToRoads`
  (`SceneBuilder`), a seção "Estrada" do Inspector + `RoadApi`, `Terrain.setRoadMolding`/`roadDelta`,
  o botão "Estrada"/flag `editingRoad`, exports, `VENDOR_TYPE_MODULES`, testes e texturas
  `assets/roads/` (~63 MB no projeto). ~1.6k LOC + binários.
- **Kit:** apagados `Kit.ts` + teste, o campo `attach`/`attachSchema`/`AttachConfig`, a opção
  `kit` do `buildScene` + `resolveAttachments`/`anchorAt` + presets `kitAssetFor` (collider/sprite),
  export e `VENDOR_TYPE_MODULES`.

## Consequências

- `buildScene`: collider efetivo = `overlay > node.collider` (sem preset de kit). Sprites/2D leem
  framedata **só do nó** (sem herdar do kit). Sem `attach` (placement por socket) — use `place`/transform.
- A cidade da Ceilândia (e qualquer geometria) vem do **Blender → `.glb`** (ADR-0088); o Studio monta.
- 506 testes passando após a remoção. Reversível via git se algum projeto futuro precisar.
- ADRs substituídos: **0053** (Kit) e **0072/0075/0076/0087/0088** (Road) — todos cobertos aqui.
