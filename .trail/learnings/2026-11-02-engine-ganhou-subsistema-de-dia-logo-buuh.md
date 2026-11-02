---
title: Engine ganhou subsistema de diálogo + 1ª UI de runtime (DOM) + StoryState
author: Buuh
date: 2026-11-02
id: l-de366d7c
scope: repo
status: active
touches:
  - src/narrative/StoryState.ts
  - "src/core/LoadingScreen.ts#createDomLoadingScreen"
  - "src/dialogue/DialogueRunner.ts#DialogueRunner"
  - "src/dialogue/DialogueUI.ts#DialogueUI"
  - "src/dialogue/startDialogue.ts#startDialogue"
---

## Decided
O engine cortex-game-engine ganhou seu **primeiro subsistema de narrativa e a 1ª UI
de runtime** (ADR-0070, `docs/adrs/0070-...`):

- `src/dialogue/` — diálogo como **dado** (grafo Zod), `DialogueRunner` (lógica pura,
  testável), `DialogueUI` + `startDialogue` (DOM overlay, espelha
  `createDomLoadingScreen`; **não** quads no Three).
- `src/narrative/StoryState.ts` — store de flags (base do save narrativo).
- Exportados em `index-runtime.ts`; doc em `engine-api.md` + `architecture.md §8b`.

Princípio (lição do ADR-0055 logic-bricks): diálogo é **conteúdo autoral**, não
comportamento — **não escreve transform/física** (sem conflito de dono). Pistas saem
via callback `onClue` (string id); o engine **não sabe** o que é uma pista — quem
trata é o jogo (ver projeto-ddd-61 / ADR-009 do jogo).

UI de runtime = **DOM overlay** é o padrão decidido pra menus/HUD/diálogo (production-safe).

_From Claude Code's memory of this repo, last updated Jun 21._
