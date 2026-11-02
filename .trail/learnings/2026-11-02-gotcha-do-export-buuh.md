---
title: GOTCHA do export
author: Buuh
date: 2026-11-02
id: l-6423cb06
scope: repo
status: active
touches:
  - "src/ecs/Entity.ts#Entity.getComponent"
  - "src/systems/SkidMarkSystem.ts#SkidMarkSystem"
---

## Decided
O **cook do export nativo** (ADR-0108) lê e regrava cada `.glb` com
`gltf-transform` pra converter textura em KTX2, e na regravação os atributos saem
**interleaved** (um bufferView só, com `byteStride`). O `GLTFLoader` entrega então
`InterleavedBufferAttribute`, cujo `.array` é o **bloco inteiro** — posição,
normal, uv, joints e pesos juntos — e não a fatia do atributo.

**Why:** código que percorre `attribute.array` de 4 em 4 (ou de 3 em 3) funciona
no Studio/browser, onde os assets de `assets/` são densos, e **quebra só no
export**: lê valores de outros atributos e escreve por cima da geometria. Foi o
que sumia com toda peça de roupa re-skinnada do guarda-roupa do teste4 (só o
capacete, peça rígida, aparecia) — spec 0029 do teste4, `remapSkinAttributes`.

## Watch out
ao mexer em buffer de geometria carregada de `.glb`, use sempre
`attribute.count` + `getComponent`/`setXYZW`/`getX`/`setXYZ` — resolvem stride,
offset e `normalized` nos dois layouts. Nunca `attribute.array`. Geometria criada
em código (ex.: `SkidMarkSystem` do engine) é densa e não tem esse risco.

Diagnóstico: o warn do jogo contava "15899 vértices" numa peça de 1223 — o número
é `verts × byteStride / 4`, assinatura de leitura do bloco inteiro. Confirmar
layout com um dump dos `bufferViews` do GLB (procurar `byteStride`): fonte não
…

_From Claude Code's memory of this repo, last updated Jul 30._
