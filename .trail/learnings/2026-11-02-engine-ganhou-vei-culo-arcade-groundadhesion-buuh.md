---
title: Engine ganhou veículo arcade (GroundAdhesion + VehicleArcadeSystem + Route) e teto de…
author: Buuh
date: 2026-11-02
id: l-922ecbd0
scope: repo
status: active
touches:
  - src/scene/Route.ts
  - "src/components/ArcadeVehicleComponent.ts#ArcadeVehicleComponent"
  - "src/dialogue/DialogueRunner.ts#DialogueRunner.advance"
  - "src/dialogue/startDialogue.ts#startDialogue.advance"
  - "src/physics/RapierPhysics.ts#RapierPhysics.advance"
  - "src/physics/GroundAdhesion.ts#GroundAdhesion"
  - "src/systems/VehicleArcadeSystem.ts#VehicleArcadeSystem"
---

## Decided
Em 2026-09-24 o usuário encerrou o kart-racer e vai começar um jogo de corrida
novo (estilo Asphalt Xtreme / Mario Kart). O que o kart escreveu contra a engine
subiu para ela (ADR-0256, SPEC-0259): `GroundAdhesion` (porta do followGround),
`VehicleArcadeSystem` + `ArcadeVehicleComponent` (frota no mesmo mundo),
`RapierPhysics.advance` (passo semi-fixo), `src/scene/Route.ts` (raceMath +
routeIndex, paridade exata verificada). Teto de fps: `game.maxFps` (ADR-0257,
SPEC-0258) — só divisores do refresh dão frames iguais (75 Hz: 75/37,5/25).

Estado: MESCLADO na main e publicado em 2026-09-24 (merge ac941502). A junction
`native/third_party` da worktree `jge-arcade` já foi desfeita; a worktree e a
branch `feat/veiculo-arcade-e-fps-cap` ainda existem (remoção bloqueada pela
permissão, ficou com o usuário).

**Why:** o kart-racer não será migrado (ADR-0256); o jogo novo começa usando a API.

## Watch out
IA de rival, itens, volta e respawn ficam no JOGO (piloto =
ScriptBehavior que escreve forças). Drift/boost ficaram de fora de propósito —
entram quando o jogo novo disser se quer miniturbo (Mario Kart) ou boost (Asphalt).
Falta validar no export rodando (só teste unitário + host compilado). Ver
gotcha-api-faltando-no-rapier-do-host.

_From Claude Code's memory of this repo, last updated Sep 24._
