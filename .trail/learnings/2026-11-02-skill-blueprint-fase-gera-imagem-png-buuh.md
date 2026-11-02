---
title: Skill blueprint-fase gera IMAGEM (PNG) de blueprint de fase a partir de um kit curado do…
author: Buuh
date: 2026-11-02
id: l-d2b948e4
scope: repo
status: active
touches:
  - electron/agent/tools/blueprint.ts
  - electron/agent/blueprint/renderBlueprint.ts
---

## Decided
Skill `blueprint-fase` (`.claude/skills/blueprint-fase/`, projeto js-game-engine),
criada 2026-07-22. Gera a **imagem final** (PNG, não HTML) de um blueprint de fase:
nível-exemplo com peças posicionadas (thumbnails reais do kit), zonas hachuradas,
passos numerados, caminho do jogador (tracejado) e legenda com o **nome de arquivo
exato** de cada peça — pra passar pro dev implementar.

Arquitetura (espelha skill-process-asset-kit/gen-kit): a IA faz o DESIGN num
`blueprint.json` (posiciona peças em px, define zones/steps/pathD); os scripts fazem a
render determinística. `scripts/render_blueprint.mjs` (blueprint.json + kit → HTML
self-contained, embute thumbs base64, deriva cor da legenda do role/tags do kit.json,
tamanho pelo bbox). `scripts/shot.mjs` (HTML → PNG via Chrome/Edge headless, acha o
browser sozinho, altura carimbada `<!--BP_W BP_H-->` no HTML). Estilo dark-violet.

**Why:** o usuário deixou explícito "quero uma imagem final de blueprint, não um html".

## Watch out
o entregável é sempre o PNG (Read pra validar e iterar posições);
orientações top-down (com zones) e side-scroller (pathD com arcos Q). Combina com
skill-level-design-plataforma (critérios) e a skill montar-jogo (construção real).

**Orientada a GAMEPLAY (2026-07-23):** cada peça declara `behavior` (spawn/goal/
checkpoint/collectible/hazard/hazard-spinner/hazard-chaser/launcher/platform/
platform-moving/blocker/ground/decoration) + `script` (Perigo/Trampolim/Checkpoint/
Moeda/Chegada/MarteloGiratorio/Drone/Patrulha) + `params` (`{raio}`, `{impulso}`,
…

_From Claude Code's memory of this repo, last updated Jul 23._
