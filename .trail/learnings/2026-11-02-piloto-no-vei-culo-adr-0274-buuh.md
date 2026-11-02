---
title: "Piloto no veículo (ADR-0274/SPEC-0275): assento + animador por estado + pose procedural"
author: Buuh
date: 2026-11-02
id: l-fa340b5d
scope: repo
status: active
touches:
  - "src/components/ProceduralDriverPoseComponent.ts#ProceduralDriverPoseComponent"
  - "src/components/VehicleAnimatorComponent.ts#VehicleAnimatorComponent"
  - "src/components/VehicleSeatAttachmentComponent.ts#VehicleSeatAttachmentComponent"
  - "src/scene/VehicleDriver.ts#setupVehicleDriver"
  - "src/systems/VehicleDriverSystem.ts#VehicleDriverSystem"
---

## Decided
Engine ganhou piloto em veículo (2026-09-25, branch claude/vehicle-character-engine-05d7b4): `setupVehicleDriver`, `VehicleSeatAttachmentComponent`, `VehicleAnimatorComponent` (mixer próprio, crossfade por peso), `ProceduralDriverPoseComponent`, um `VehicleDriverSystem` (assento→mixer→pose). Cena de validação: `yarn dev:vehicle-driver`.

**Decisão do usuário:** nada de IK em runtime nesta etapa. Mãos no volante e pés nos pedais são resolvidos no Blender e baked em CADA clipe (idle/accelerate volante reto; steer/drift mãos+tronco seguindo o volante; brake pé direito no freio; victory livre). A engine só carrega, toca e faz crossfade; a pose procedural é só ajuste fino de Spine/Chest/Head.

**Why:** o usuário quer a pose autorada no DCC, não corrigida pela engine.

## Watch out
ao gerar/converter piloto (Mixamo, Chat IA), renomear bones para a convenção (Head, Spine, Chest, LeftHand…) e bakear a pose por clipe no pipeline — não propor IK na engine sem o usuário pedir. Liga em mixamo-character-pipeline e engine-veiculo-arcade-adr-0256.

_From Claude Code's memory of this repo, last updated Sep 25._
