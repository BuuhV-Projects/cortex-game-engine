---
title: "RESOLVIDO (SPEC-0617, commit 2571099b na branch claude/js-game-engine-game-85715e)"
author: Buuh
date: 2026-11-02
id: l-6a8bfd0f
scope: repo
status: active
touches:
  - src/core/WarmupFrame.ts
  - "src/core/Game.ts#Game.precompile"
  - "src/core/Renderer.ts#Renderer.precompile"
  - "src/render/native/NativeRenderer.ts#NativeRenderer.precompile"
  - "src/core/WarmupFrame.ts#drawWithParallelPipelines"
  - "tests/core/RenderPhaseProbe.test.ts#Colaborador.updateForRender"
  - "tests/core/WarmupFrame.test.ts#FakePipelines.updateForRender"
---

## Decided
Sintoma (2026-10-28, Gem Hopper): `outdoorLighting.skybox` / degradê saíam PRETOS no navegador; fundo de
COR funcionava (com GPU real). Primeiro achei que era `autoClear=false` / painel do navegador — errado.

Causa: `drawWithParallelPipelines` (ADR-0310, `src/core/WarmupFrame.ts`) fazia TODO `updateForRender` virar
pipeline assíncrono, inclusive os renders INTERNOS do three (panorama→cubemap do fundo, PMREM, Output Color
Transform) que rodam em OUTRA cena uma vez só → desenho pulado → cubemap preto em cache.
Fix: só objetos da cena aquecida (`renderObject.scene === root`) ficam assíncronos.

**Why:** isolar por experimento na sonda headless economizou o chute: aplicar depois da carga = OK;
+ `precompile()` = preto; só o gancho = preto; gancho filtrando cena = OK.

## Watch out
pendente MERGE na main da engine (o Studio exporta com o `src/` da main — até lá
o export pelo Studio sai com céu preto). Ao mexer no aquecimento, lembrar dos renders internos.
Ver projeto-gem-hopper.

_From Claude Code's memory of this repo, last updated Oct 28._
