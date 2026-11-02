---
title: "Crash-bandicoot-racer morria na CARGA do export (HermesGC OOM, external 553 MB > teto 512)"
author: Buuh
date: 2026-11-02
id: l-b5658ae3
scope: repo
status: active
touches:
  - "src/scene/StaticMerge.ts#flatSource"
  - "src/scene/StaticMerge.ts#mergeStaticScene"
---

## Decided
2026-09-25: export do crash-bandicoot-racer morria ~9 s após abrir. O `error_log.txt`
começa com `HermesGC: OOM ... heapSize=25MB allocated=19MB external=553MB` — o que estoura
é a memória EXTERNA (ArrayBuffers), não objetos JS. O trace `TERMINATE ... JSOutOfMemoryError`
de baixo é só a saída do processo (símbolos errados, sem PDB). A/B provou: sem colisão na
decoração morre igual; `mergeStatic:false` carrega (13 fps --debug, 1.900 draws). Pico =
`mergeStaticScene`: GLB cozido é interleaved → `flatSource` clona cada fonte de-interleavada
e guarda num WeakMap preso à fonte (viva no cache de GLB) → 3 cópias no pico.

Fix provisório pedido pelo usuário: `kMaxHeapBytes` 512 MB → 1 GB (hermes_embed.cpp, ADR-0278,
SPEC-0279, Xbox tem 10 GB). Medido: carrega com merge, ~36 fps --debug, 570 draws, 1,8 GB WS.

**Why:** o jogo tem ~4,7 M tris (decoração muito densa); o teto só dá folga.

## Watch out
pendentes = fusão sem a cópia plana (bake direto do interleaved) e enxugar
modelos da decoração. Teto de 1 GB mesclado na main (d1d49252) e host rebuildado pelo usuário;
o jogo usa `mergeStatic: true` (commit eef85cc). Medir export: copiar o jogo pro scratchpad e exportar DA WORKTREE
(export-usa-src-nao-vendor); build do host na worktree com `-B native/build` PRÓPRIO
(build-host-nativo-em-worktree). Ver vazamento-heap-js-cache-imagem.
…

_From Claude Code's memory of this repo, last updated Sep 25._
