---
title: "Grama do campo do DDD 00 (SPEC-0083/ADR-0082, PR ddd00-game#12) vinda do build Unity…"
author: Buuh
date: 2026-11-02
id: l-5a7ceda8
scope: repo
status: active
touches:
  - "src/input/ControlsScreen.ts#cell"
  - "src/scene/Vegetation.ts#Vegetation"
---

## Decided
01/11/2026: grama "realista" extraída de `E:/Downloads/ValleyGrass` (demo IL2CPP do URP Realistic Dynamic Grass) e
levada ao campo do DDD 00 — branch `feat/grama-campo`, PR BuuhV-Projects/ddd00-game#12. Scripts e método em
`D:/ai-scripts/unity-valleygrass/` (COMO-FOI-FEITO.md); sondas `D:/ai-scripts/port-hollow/campo/grama*.json`.

- O "sistema" é asset + Shader Graph (vento `_WindDir`, empurrão `_pos`); C# é fino. REA: `inspect_il2cpp_metadata`
  + `inspect_analysis_view` (declaring_types são ÍNDICES numéricos, fields só aceita name/declaring_type/index).
- v1 **estática**: o renderer C++ recusa material com nó → vento/empurrão só quando a engine tiver deformação de
  vértice de folhagem no C++.
- Geração sob demanda (célula 32 m, raio 60 m, histerese 15, 1 célula/quadro), 1 `Vegetation` por espécie, segue o
  verde do splat (`dirtPatch`). Licença do pacote a confirmar.
- Gotcha de validação: manchas de ruído deixam vãos grandes — a sonda tem de PROCURAR uma mancha (`__meadow.cell`)
  antes de fotografar, senão parece que não gerou nada.

**Why:** usuário quer o campo menos vazio sem cobrir o mapa e sem custo longe.

## Watch out
ajustes de
densidade/manchas em `region/meadow.ts`; ver projeto-port-hollow, mapa-bem-trabalhado, renderer-cpp-padrao-no-export.

_From Claude Code's memory of this repo, last updated Nov 1._
