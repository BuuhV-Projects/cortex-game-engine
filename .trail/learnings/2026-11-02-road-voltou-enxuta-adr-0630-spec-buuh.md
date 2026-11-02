---
title: "Road VOLTOU enxuta (ADR-0630/SPEC-0631, 31/10/2026, branch feat/estrada-enxuta) pro Port…"
author: Buuh
date: 2026-11-02
id: l-264b363c
scope: repo
status: active
touches:
  - "electron/renderer/Resizer.ts#Resizer.attach"
  - "src/core/InputManager.ts#InputManager.attach"
  - "src/input/captureBinding.ts#createBindingCapture.attach"
  - "src/scene/Terrain.ts#Terrain.baseHeightAt"
  - "src/scene/Terrain.ts#Terrain.setRoadMolding"
---

## Decided
**31/10/2026 — Road VOLTOU, enxuta (ADR-0630 substitui em parte o ADR-0089; contrato SPEC-0631).** Dono: Port Hollow
(estrada da serra, PRD-0002 do jogo). Branch `feat/estrada-enxuta` da engine (não mergeada quando escrito). Só o núcleo:
nó `road` {points mundo, width, talude, maxSlope, grade terrain|points, texture, tile, drivable}, corte/aterro como delta
somado à base (`Terrain.setRoadMolding`/`baseHeightAt`; getHeights = só base), fita com `cortexRoad`, F2 (Desenhar
estrada, Inspector "Estrada", Editar traçado), overlay `data.road[id]` vence. Molda TODOS os ladrilhos que cruza.
Fora: perfis, cruzamentos, navGraph, RegionSpec, marcações, pontes. Greide parte da BASE (raycast na malha
realimentava o corte — bug do código antigo).

**Kit** (`Kit.ts`, `attach`, presets) continua REMOVIDO (ADR-0089).

---
(histórico) ADR-0089 tinha removido Road e Kit por falta de dono; antes disso, a geração procedural de cidade
(ADR-0087: perfis, citySpec, navGraph) foi abandonada pelo Blender (ADR-0088) no DDD-61.

_From Claude Code's memory of this repo, last updated Oct 31._
