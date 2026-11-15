---
title: "Com o repo privado, o merge automático sai pelo token do App, senão o release para"
author: Buuh
date: 2026-11-15
branch: ci/release-publico-auto-merge
cost: { minutes: 12, tokens: 87702 }
id: l-f0bca190
scope: repo
status: active
src: agent
touches:
  - ".github/workflows/release.yml"
  - README.md
  - web/docs-content/en/02-installation.md
  - web/docs-content/pt/02-instalacao.md
  - ".github/scripts/auto-merge.d.mts"
  - ".github/scripts/auto-merge.mjs"
  - ".github/workflows/auto-merge.yml"
  - ".github/workflows/claude-review.yml"
  - tests/scripts/autoMerge.test.ts
  - tests/scripts/autoMergeStack.test.ts
---

## Decided
O repo do engine vai ficar privado (plano Free): o ruleset e o auto-merge nativo deixam de valer. O merge passa a sair de um workflow próprio, portado do ddd00, com o mesmo gate (checks do ruleset, Claude review 5/5, conversas resolvidas). Os instaladores são publicados de novo num repo público só de releases, porque release de repo privado devolve 404 sem login.

## Tried and ruled out
- Mergear com o token padrão do Actions, como o ddd00 faz: merge por esse token não dispara o push na main, e é no push que o semantic-release e o build dos instaladores rodam. Aqui o merge usa o token do App.
- Deixar a release só no repo do engine: com o repo privado, ninguém de fora baixa.

## Watch out
- O check do host nativo vem "skipped" quando o PR não toca o nativo; o auto-merge aceita skipped só nele.
- Resolver conversa sem novo push não dispara nada: rodar o workflow à mão com o número do PR.
- O descarte do review em runner self-hosted foi porque o repo era público (um PR poderia rodar código na máquina); com o repo privado esse motivo cai.
- O repo público e a instalação do App nele são manuais. O job `release` confere os dois antes do semantic-release: sem eles, nenhuma release do engine sai (o push na main fica vermelho até arrumar).

In the code: `.github/scripts/auto-merge.mjs` (REQUIRED_CHECKS, SKIPPABLE_CHECKS, MERGE_TOKEN), `.github/workflows/auto-merge.yml`, `.github/workflows/release.yml` (RELEASES_REPO = cortex-studio-releases), `claude-review.yml` (job `merge-dispatch`, o único com `actions: write`).
