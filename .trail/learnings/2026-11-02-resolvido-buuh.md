---
title: RESOLVIDO
author: Buuh
date: 2026-11-02
id: l-2f02d19c
scope: repo
status: active
touches:
  - electron/agent/performanceRules.ts
  - "src/core/Game.ts#Game.precompile"
  - "src/core/Renderer.ts#Renderer.precompile"
  - "src/render/native/NativeRenderer.ts#NativeRenderer.precompile"
---

## Decided
Travada da primeira volta que sumia depois do R (2026-09-24): pipelines nascendo
em plena corrida (compilar é síncrono no host). A SPEC-0261 (`pipelinesBorn` no
perf-trace: objeto, material, câmera, ms, `key`) nomeou as causas pela CHAVE de
cache do three (38 campos; variavam só ids de shader, `side` (22) e espaço de
cor do alvo (25)):

1. `compileAsync` compilava `side=2` para transparente DoubleSide, mas o render
   usa dois passes (`side=1`,`side=0`) — e levava 7,9 s no host (um objeto por
   quadro). Fix na engine: `game.precompile()` desenha UM quadro real (ADR-0262).
2. `pass()` do borrão de velocidade = outro alvo → cena inteira recompila na 1ª
   vez que liga. Fix no jogo: aquecer com `forceBlur` (kart SPEC-0021).
3. `InstancedMesh` gera 1 shader de vértice POR OBJETO → míssil novo compila.
   Fix: criar os objetos no boot (pool pré-alocado).

Resultado medido: 60 pipelines/1,1 s na corrida → ZERO; quadro máx 22,6 ms.
Custo: 2 quadros de aquecimento de 5,4 s + 3,3 s congelam a tela de carregamento.

**Why:** "trava só na 1ª vez / some ao reiniciar" = compilação preguiçosa.

## Watch out
para travada assim, rode volta a frio com `--debug` + `?bench`
e leia `pipelinesBorn` + evento `precompile`; o `born.pipelines` é ACUMULADO e o
p99 é janela móvel de 240 quadros (quadro de aquecimento contamina ~3 s depois).
Liga em congelamento-fora-do-processo (o congelamento de 1 s SEM queda de fps
é outro fenômeno) e validar-instrumento-antes-de-concluir.

**Fechamento (2026-09-24, playtest do usuário):** 70 fps a maior parte do tempo.
O aquecimento por quadro real inflou o heap do JS de 41 para 120 MB de uma vez
…

_From Claude Code's memory of this repo, last updated Sep 24._
