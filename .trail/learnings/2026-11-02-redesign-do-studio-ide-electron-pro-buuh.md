---
title: "Redesign do studio (IDE Electron) pro \"Layout A\""
author: Buuh
date: 2026-11-02
id: l-9dcd6f36
scope: repo
status: active
touches:
  - "src/core/Game.ts#Game.gameplayPaused"
  - "src/editor/EditorModel.ts#describeOutliner"
  - "src/editor/ObjectEditSystem.ts#ObjectEditSystem.setGizmoMode"
  - "src/ui/runtime/UiLayer.ts#UiLayer.viewport"
---

## Decided
Redesign visual do studio (IDE Electron) pro **Layout A** ("Classic Dock",
estilo Unity/Godot), na branch **`release/new-design`** (fora da `main`). Mockup
de referência veio do usuário (`D:/jogos/ide -teste`, React); portado pra DOM
vanilla no renderer.

Estrutura (esq→dir): menubar frameless + toolbar (transport da gameplay + leitura
de câmera) · **LeftDock** (abas Hierarquia | Projeto + busca; hierarquia = árvore
aninhada da ponte, Projeto = FileTree) · centro (viewport com pills flutuantes +
console) · **Inspector** (dock próprio) · Chat IA.

Peças-chave (renderer): `Shell.ts` (menubar+toolbar), `LeftDock.ts`, `EditorPanels.ts`
(outliner+inspector via ponte ADR-0056, dois hosts), `ui.ts` (h+icons), tema
`themes/cortex-dark.json` (OKLCH), `ide-design.css` (design-system).
Engine: janela frameless (`frame:false` + IPC `window:*`), pause Unity-style
(`game.gameplayPaused`), outliner recursivo (`describeOutliner`), `setGizmoMode`,
ponte publica `viewport` (cam/perf/seleção/ferramenta).

Validado pelo validate-ui-vite-harness (sem rodar Electron no agente).
Commits: 334bc70→3e82725. Falta (opcional): merge na main após aprovação ao vivo.

_From Claude Code's memory of this repo, last updated Jun 9._
