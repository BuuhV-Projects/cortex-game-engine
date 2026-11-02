---
title: GOTCHA - place.y de nó model é a BASE do glb (placeOnGround ergue até o bbox mínimo)
author: Buuh
date: 2026-11-02
id: l-2de5ae6e
scope: repo
status: active
touches:
  - "src/core/debug.ts#debug"
  - "src/dialogue/DialogueUI.ts#createUiDialogueUI.render.place"
  - "src/scene/RoadBridgeParts.ts#place"
  - "src/scene/SceneAssets.ts#placeOnGround"
  - "src/scene/SceneBuilder.ts#applyPlacement"
---

## Decided
**Contrato `placeOnGround` do engine** (`SceneBuilder.applyPlacement`): pra nó
`model` com `place`, `place.y` é onde a **BASE** do modelo apoia — o builder
ergue o glb até o bbox mínimo encostar nela. NÃO é a posição da origem/pivô.

**Why:** o `pendulum()` do teste4 passava "altura de pivô" (deck+4.6) em
`place.y` → o auto-ground erguia o modelo inteiro e a lâmina em REPOUSO ficava
a 4.6 m do deck ("pêndulo varre o céu, nem encosta no player" — playtest
2026-07-27, spec 0019 ajuste 8).

## Watch out
- Builder que quer pendurar algo: passe o PISO em `place.y` e deixe o
  auto-ground pôr o pivô no topo do modelo (script balança em torno da origem
  pós-lift).
- Altura real de um glb = bbox COM transforms de nó (machado do aquapark:
  4.93 em mundo vs −4.67 no accessor cru). NUNCA medir por accessor min/max
  de POSITION quando há nós filhos com translation.
- Diagnóstico rápido: `console.debug` no `onStart` + rodar o export nativo
  capturando stdout (`[js] [debug]` aparece no log) — o lift observado entrega
  a altura real de cada modelo.
…

_From Claude Code's memory of this repo, last updated Jul 27._
