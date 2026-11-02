---
title: "Visible=false e a física do personagem: desde a SPEC-0307 (engine 37715226) subárvore…"
author: Buuh
date: 2026-11-02
id: l-6c746bd0
scope: repo
status: active
touches:
  - src/physics/nearMeshes.ts
  - "src/physics/nearMeshes.ts#NearMeshIndex.nearXZ"
  - "src/physics/nearMeshes.ts#traverseCollidable"
  - "src/scripts/ScriptBehavior.ts#ScriptBehavior"
  - "src/scripts/ScriptBehavior.ts#ScriptBehavior.disableRaycast"
  - "src/systems/CharacterPhysicsSystem.ts#CharacterPhysicsSystem"
  - "src/systems/ThirdPersonControlSystem.ts#ThirdPersonControlSystem.placeCamera"
  - "src/systems/VehicleControlSystem.ts#VehicleControlSystem.placeCamera"
  - "tests/systems/PlatformerPhysicsSystem.test.ts#solid"
---

## Decided
**Hoje (engine main 37715226, SPEC-0307, 2026-10-06):** `traverseCollidable`
(src/physics/nearMeshes.ts) poda ANTES do raycast a subárvore `editorInternal`
(gizmo do editor) e a subárvore com `visible = false` — no `CharacterPhysicsSystem`
e na câmera (`placeCamera`). Exceção: objeto escondido que é ele mesmo
`cortexSolid` continua colidindo (padrão `collision.glb` invisível + `collider.solid`
do crash-bandicoot-racer). O BVH das escondidas ainda é montado no carregamento
(evita pico ao aparecer). `nearXZ` ganhou faixa em Y.

**Antes da SPEC-0307:** `visible = false` NÃO tirava o mesh da física (raycast do
three ignora visibilidade) → marcador "invisível" virava plataforma fantasma
(bug "player nasce no ar" do teste4, 2026-07-28). `this.disableRaycast()` do
`ScriptBehavior` segue sendo o jeito explícito e vale em versões antigas vendorizadas.

**Why:** a poda tirou 235→~37 malhas testadas em (0,0) no Detetive Brasília (gizmo
parado na origem + veículos guardados embaixo dela); física 4 ms → 0,8 ms.

## Watch out
jogo com vendor anterior a 37715226 ainda tem o gotcha antigo. Pra
algo invisível que DEVE ser chão, marque `collider.solid` (cortexSolid). Guardar
veículos "fora do mapa" longe em XZ (ex. 1e5), não embaixo da origem. Teleportar
character pra marcador: alvo é a base (`Box3.min.y`), não o centro.

Relacionado: place-on-ground-contrato, regra-animacao-mecanicas,
teste4-cute-obstacle-rush

_From Claude Code's memory of this repo, last updated Oct 6._
