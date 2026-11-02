---
title: "GOTCHA RESOLVIDO: three-mesh-bvh no modo padrão cria/reordena índice"
author: Buuh
date: 2026-11-02
id: l-0e966b3b
scope: repo
status: active
touches:
  - src/physics/raycastAccel.ts
  - "src/editor/EditorCameraSystem.ts#EditorCameraSystem"
  - "src/physics/raycastAccel.ts#ensureBoundsTree"
---

## Decided
Sintoma (Studio, WebGPU): voar com WASD no editor sobre a cidade → tela preta, console `Calling Draw with an index count of 0 is unusual` + `setIndexBuffer ... parameter 1 is not of type 'GPUBuffer'`. Causa: `ensureBoundsTree` (engine `src/physics/raycastAccel.ts`) montava a BVH no modo padrão, que CRIA índice em geometria não-indexada (as `mergeFlat` da cidade) / reordena o existente — depois do 1º upload. O `EditorCameraSystem` monta BVH das malhas visíveis ao navegar. Fix (SPEC-0304, engine main 51d64a9c, 2026-10-05): `computeBoundsTree({ indirect: true })` — usuário confirmou que parou.

**Why:** o Chrome headless do probe (também WebGPU) NÃO reproduziu nem antes do fix — só o Electron/D3D12 do Studio quebra. Perdi várias rodadas tentando reproduzir no headless.

## Watch out
erro de buffer/índice WebGPU que só o usuário vê no Studio → pedir o console COMPLETO (a linha "index count 0" foi a pista) e procurar quem muta geometria depois do 1º desenho (BVH, toNonIndexed, setIndex, merge in-place). Provar a mutação por contagem (malhas sem índice antes/depois), não esperar o erro no headless. Ver validar-instrumento-antes-de-concluir e colisao-highpoly-bvh.

_From Claude Code's memory of this repo, last updated Oct 5._
