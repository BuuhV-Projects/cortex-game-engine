---
title: Fase 2 do crash-bandicoot-racer (reference-circuit) gastava metade dos draws numa sombra…
author: Buuh
date: 2026-11-02
id: l-fa81f88f
scope: repo
status: active
touches:
  - "native/scripts/perf/trace-stats.mjs#camPitch"
  - "native/src/shims/raycast_shim.cpp#world"
  - "src/scene/SceneAssets.ts#instance"
---

## Decided
2026-10-02: fase 2 (`reference-circuit`, "Circuito da Baía", streaming via CircuitStreamingSystem, mergeStatic:false) tinha `shadowArea: 2169` sem `csm` → frustum único 4,3 km, ~2 m/texel: karts SEM sombra visível, mas 439 de 813 draws eram do passe de sombra. Esses draws usam o NodeMaterial de override da sombra (`colorNode`) → `hasNode` → refresh de nodes/bindings TODO frame (era o "454 hasNode" do experimento de uniforms em D:/Codex/2026-10-02/phase-2-runtime).

Medido (probe D:/Codex/2026-10-02/phase-2-runtime/shadow-experiment, 1080p, simulação pausada): parada legacy 20 fps → csm (3 cascatas, 220 m, igual à fase 3 waterfall) 40–50 fps; câmera móvel 27–28 → 40–45 fps. Captura: CSM dá sombra real nos karts.

GOTCHA de instrumento: `__cortexNapiStats().draw` NÃO conta os draws das cascatas do CSM (csm mostrou 374 = igual a sem sombra); setBindGroup subiu 378→640. Confirmar por captura de imagem, não pelo contador. Ver validar-instrumento-antes-de-concluir.
…

## Watch out
fase grande com mapa escalado → sempre `csm` + `shadowDistance`, nunca `shadowArea` gigante. Relacionado: malha-unica-de-sombra, perf-render-kart-racer.

03/10 (tarde): manchas escuras serrilhadas na pista = sombra do terreno `33-base-ilha` (fixed_lod 2, grosseiro) → só recebe sombra (SPEC-0025 do jogo). Câmera subia ao acelerar por causa do pitch fixo 0,32 da chase cam → `camPitch` na engine (SPEC-0293) + câmera da fase {20, 8, pitch 0} (SPEC-0024). Portal da largada veio girado 90° (pilares sobre a rota) e o build.py da colisão cortava a base dos pilares na faixa (fantasma até ~3,5 m) → gira
…

_From Claude Code's memory of this repo, last updated Oct 3._
