---
title: Medições do renderer nativo usam uma CÓPIA congelada do DDD 61…
author: Buuh
date: 2026-11-02
id: l-86d4f851
scope: repo
status: active
touches:
  - native/scripts/check-stage.sh
---

## Decided
As frentes de perf/renderer medem o DDD 61 numa cópia congelada (`D:/jogos/detetive-brasilia-rs-<commit>`, `DEFAULT_GAME` do `native/scripts/check-stage.sh`), não na main do jogo. Em 24/10/2026 o fix do jogador dentro do ônibus (SPEC-0193 do jogo, `e1cede4`) entrou na main e o usuário viu o bug seguir nas rodadas — a cópia ainda era `e2be01c`.

**Why:** a cópia existe para A/B estável (os dois braços no mesmo commit do jogo); por isso nunca é atualizada sozinha.

## Watch out
ao mergear no jogo algo que muda o que as medições veem (física, spawn, autopiloto, cena), na mesma hora peça à sessão dona da cópia para criar a cópia nova do commit, trocar o `DEFAULT_GAME`, avisar as frentes e registrar no PRD a troca de alvo. Nunca misturar braços de cópias diferentes num A/B. Ver pagina-plano-renderer-nativo.

_From Claude Code's memory of this repo, last updated Oct 24._
