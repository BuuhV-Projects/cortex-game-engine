---
title: "DDD 61 tem validação por comando único (tools/validate.sh, ADR-0177/SPEC-0178)"
author: Buuh
date: 2026-11-02
id: l-99340ca8
scope: repo
status: active
touches:
  - CLAUDE.md
---

## Decided
Desde 18/10/2026 (main c5fad4d) o DDD 61 tem `tools/validate.sh --profile <p> [--base <sha>] [--steps ...]`: typecheck + vitest + cenários headless (sonda única `tools/probe.mjs`) + A/B de fps intercalado (10 pares, teste do sinal ≥90%, −5% reprova) + relatório `summary.md`/`result.json` em `.cortex/validate/<run>/`. Saída: 0 aprovado, 1 reprovado, 2 infra/timeout, 3 inconclusivo, 64 uso. Perfis em `tools/profiles/*.json` (hoje `core` e `pedestrians`). Build não roda (AGENTS.md §6). Worktree da base fica em `D:/jogos/detetive-brasilia-validate-base-<sha12>` (cache). Doc no CLAUDE.md do jogo.

**Why:** o usuário quis cortar o custo recorrente de tokens (sondas recriadas, medição conduzida à mão, logs lidos inteiros).

## Watch out
em todo brief de frente do DDD 61, mandar validar com `tools/validate.sh` (criar perfil novo se o tema não tiver) e ler só o summary; não escrever sonda própria. Inconclusivo ≠ aprovado. Ver ponytail-nos-subagentes.

_From Claude Code's memory of this repo, last updated Oct 18._
