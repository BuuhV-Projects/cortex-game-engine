---
title: Perf do host nativo ADIADA (2026-10-10)
author: Buuh
date: 2026-11-02
id: l-cd7d3841
scope: repo
status: active
touches:
  - docs/prds/0009-backlog-perf-nativo-modelo-godot.md
---

## Decided
Em 2026-10-10 o usuário decidiu: trabalhar no jogo rodando no Studio (V8/JIT, ~75 fps) e só atacar a perf do nativo quando for exportar. O backlog está em `docs/prds/0009-backlog-perf-nativo-modelo-godot.md` (branch `claude/godot-typescript-performance-39827f`, aguardando merge): B1 zero alocação/quadro, B2 = ADR-0237 M0–M8 ("RenderingServer", gráfico construído pelo nativo e não pelo three.js), B3 skinning em C++, B4 primitivas de gameplay nativas, B5 threads C++ (depende do B2), B6 Static Hermes.

**Why:** JIT é proibido no Xbox; o Godot resolve com núcleo C++ + C# NativeAOT, ou seja, os laços quentes ficam fora do script interpretado.

## Watch out
não puxe trabalho de perf nativa por iniciativa própria enquanto o foco for o jogo no Studio; ao exportar, comece pelo B1 e pelo M0 do B2.

**RETOMADO em 2026-10-22 (pedido do usuário):** sessão de perf aberta com 4 frentes paralelas (sessões b4-raycast-cpp, b1-zero-alloc, b2-desenho-nativo, cauda-cull-outlines), todas cortadas da main, sem merge sem aprovação. O PRD-0009 foi corrigido (a 1ª versão ignorava o que o ciclo do DDD 61 já tinha entregue: espelho, projeção C++, sombra nativa, Rapier nativo). JOGO-ALVO das medições = MAIN ATUAL do DDD 61 fixada em e2be01c (decisão do usuário), em wor
…

_From Claude Code's memory of this repo, last updated Oct 22._
